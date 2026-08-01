import { createHash } from "node:crypto";
import path from "node:path";
import { errorJson } from "@/lib/api-response";
import { putStoredObject } from "@/lib/object-storage";
import { createCertificatePdf } from "@/lib/pdf";
import { query } from "@/lib/postgres";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/session";
import { requiredUuid } from "@/lib/validation";

export const runtime = "nodejs";

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

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);
  const limited = await enforceRateLimit({ key: rateLimitKey("pdf", user.id), limit: 20, windowMs: 60_000, type: "pdf", userId: user.id });
  if (limited) return limited;
  const denied = await requirePermission(user, "certificate.read");
  if (denied) return denied;
  const pickupId = requiredUuid(id);
  if (!pickupId) return errorJson("Solicitud invalida.", 400);

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
    where pr.id = $1 and (
      $2 = 'admin' or pr.client_id = $3 or ta.transporter_id = $3 or pl.owner_id = $3
    )
    group by pr.id, cu.full_name, pj.name, pl.name, rp.unique_id, rp.qr_code, wt.net_weight_kg, rp.final_weight_kg, tu.company_name, tu.full_name
    limit 1`,
    [pickupId, user.role, user.id],
  );

  const pickup = result.rows[0];
  if (!pickup) return errorJson("Solicitud no encontrada.", 404);
  if (!pickup.final_weight_kg) {
    return errorJson("No se puede generar certificado sin peso final aprobado en bascula.", 409);
  }

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

  return new Response(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${pickup.id}-certificado-rcd.pdf"`,
    },
  });
}
