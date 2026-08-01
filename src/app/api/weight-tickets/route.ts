import { createHash } from "node:crypto";
import path from "node:path";
import { errorJson, okJson } from "@/lib/api-response";
import { handleOperationalEvent } from "@/lib/operations-engine";
import { putStoredObject } from "@/lib/object-storage";
import { createCertificatePdf } from "@/lib/pdf";
import { query, withTransaction } from "@/lib/postgres";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/session";
import { enumValue, finiteNumber, requiredUuid, residueTypes } from "@/lib/validation";

type CertificateRow = {
  id: string;
  address: string;
  residue_type: string;
  client: string;
  project: string;
  plant: string | null;
  passport_id: string | null;
  qr_code: string | null;
  final_weight_kg: string | null;
  transporter: string | null;
  photos: string[];
  timeline: string[];
};

async function generateCertificate(pickupRequestId: string) {
  const result = await query<CertificateRow>(
    `select
      pr.id,
      pr.address,
      pr.residue_type::text,
      cu.full_name as client,
      pj.name as project,
      pl.name as plant,
      rp.unique_id as passport_id,
      rp.qr_code,
      coalesce(wt.net_weight_kg, rp.final_weight_kg)::text as final_weight_kg,
      coalesce(tu.company_name, tu.full_name) as transporter,
      coalesce(array_agg(distinct ph.storage_path) filter (where ph.id is not null), '{}') as photos,
      coalesce(array_agg(distinct concat(te.created_at::text, ' ', te.event_name, coalesce(' (' || te.status::text || ')', ''))) filter (where te.id is not null), '{}') as timeline
    from pickup_requests pr
    join users cu on cu.id = pr.client_id
    join projects pj on pj.id = pr.project_id
    left join plants pl on pl.id = pr.plant_id
    left join residue_passports rp on rp.pickup_request_id = pr.id
    left join weight_tickets wt on wt.pickup_request_id = pr.id and wt.approved_at is not null
    left join transport_assignments ta on ta.pickup_request_id = pr.id
    left join users tu on tu.id = ta.transporter_id
    left join photos ph on ph.pickup_request_id = pr.id
    left join tracking_events te on te.pickup_request_id = pr.id
    where pr.id = $1
    group by pr.id, cu.full_name, pj.name, pl.name, rp.unique_id, rp.qr_code, wt.net_weight_kg, rp.final_weight_kg, tu.company_name, tu.full_name
    limit 1`,
    [pickupRequestId],
  );
  const pickup = result.rows[0];
  if (!pickup) throw new Error("Solicitud no encontrada para certificado.");
  if (!pickup.final_weight_kg) throw new Error("No se puede generar certificado sin peso final aprobado.");

  const pdf = createCertificatePdf({
    serviceId: pickup.id,
    passportId: pickup.passport_id ?? "Trazabilidad pendiente",
    qrCode: pickup.qr_code ?? "",
    client: pickup.client,
    project: pickup.project,
    address: pickup.address,
    transporter: pickup.transporter ?? "Transportador pendiente",
    plant: pickup.plant ?? "Planta pendiente",
    residueType: pickup.residue_type,
    netWeight: pickup.final_weight_kg ? `${pickup.final_weight_kg} kg` : "pendiente",
    photos: pickup.photos,
    timeline: pickup.timeline,
  });
  const relativePath = await putStoredObject(path.join("storage", "certificates", pickup.id, "certificate.pdf"), pdf, "application/pdf");
  const hash = createHash("sha256").update(pdf).digest("hex");
  await query(
    `insert into certificates (pickup_request_id, storage_path, public_url, verification_hash)
     values ($1, $2, $3, $4)
     on conflict (pickup_request_id) do update
     set storage_path = excluded.storage_path,
         public_url = excluded.public_url,
         verification_hash = excluded.verification_hash,
         generated_at = now()`,
    [pickup.id, relativePath, `/api/certificates/${pickup.id}`, hash],
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);
  const limited = await enforceRateLimit({ key: rateLimitKey("api_mutable", user.id), limit: 100, windowMs: 60_000, type: "api_mutable", userId: user.id });
  if (limited) return limited;
  const denied = await requirePermission(user, "weight.register");
  if (denied) return denied;

  const body = await request.json();
  const pickupRequestId = requiredUuid(body.pickup_request_id);
  const gross = finiteNumber(body.gross_weight_kg, { min: 1, max: 100_000 });
  const tare = finiteNumber(body.tare_weight_kg, { min: 0, max: 100_000 });
  const material = enumValue(body.material_classification ?? "mixto", residueTypes);
  const disposition = ["reciclaje", "trituracion", "disposicion final"].includes(String(body.disposition)) ? String(body.disposition) : null;
  if (!pickupRequestId || gross === null || tare === null || gross <= tare || !material || !disposition) {
    return errorJson("Peso bruto, tara o clasificacion invalidos.", 400);
  }

  await withTransaction(async (client) => {
    const allowed = await client.query<{ allowed: boolean }>(
      `select exists (
        select 1 from pickup_requests pr
        left join plants p on p.id = pr.plant_id
        where pr.id = $1 and ($2 = 'admin' or p.owner_id = $3)
      ) as allowed`,
      [pickupRequestId, user.role, user.id],
    );
    if (!allowed.rows[0]?.allowed) throw new Error("Solicitud no disponible para esta planta.");

    await client.query(
      `insert into weight_tickets (pickup_request_id, plant_id, gross_weight_kg, tare_weight_kg, material_classification, disposition, approved_by, approved_at)
       values ($1, (select plant_id from pickup_requests where id = $1), $2, $3, $4, $5, $6, now())`,
      [pickupRequestId, gross, tare, material, disposition, user.id],
    );
    await client.query("update residue_passports set final_weight_kg = $1 where pickup_request_id = $2", [gross - tare, pickupRequestId]);
    await client.query("update pickup_requests set status = 'certificado generado', updated_at = now() where id = $1", [pickupRequestId]);
    await client.query(
      `insert into tracking_events (pickup_request_id, user_id, user_role, event_name, status, metadata)
       values ($1, $2, $3, 'recepcion aprobada y peso validado', 'certificado generado', jsonb_build_object('gross_weight_kg', $4::numeric, 'tare_weight_kg', $5::numeric, 'net_weight_kg', $6::numeric))`,
      [pickupRequestId, user.id, user.role, gross, tare, gross - tare],
    );
  });

  await generateCertificate(pickupRequestId);
  await handleOperationalEvent("certificate.generated", pickupRequestId, { id: user.id, role: user.role }, { gross_weight_kg: gross, tare_weight_kg: tare, net_weight_kg: gross - tare });
  return okJson({ ok: true }, { status: 201 });
}
