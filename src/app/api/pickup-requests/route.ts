import { randomUUID } from "node:crypto";
import { errorJson, okJson } from "@/lib/api-response";
import { getAppUrl } from "@/lib/env";
import { handleOperationalEvent } from "@/lib/operations-engine";
import { parseCoordinates } from "@/lib/geo";
import { query, withTransaction } from "@/lib/postgres";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { requirePermission, visibilityPredicate } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/session";
import { enumValue, finiteNumber, isoDate, optionalUuid, requiredString, requiredUuid, residueTypes, volumeSizes } from "@/lib/validation";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);
  const denied = await requirePermission(user, user.role === "admin" ? "pickup.read.all" : "pickup.read.own");
  if (denied) return denied;

  const visibility = visibilityPredicate(user);
  const result = await query(`select * from pickup_requests pr where ${visibility.sql} order by created_at desc limit 50`, visibility.params);
  return okJson(result.rows);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);
  const limited = await enforceRateLimit({ key: rateLimitKey("api_mutable", user.id), limit: 100, windowMs: 60_000, type: "api_mutable", userId: user.id });
  if (limited) return limited;
  const denied = await requirePermission(user, "pickup.create");
  if (denied) return denied;

  const body = await request.json();
  const projectId = requiredUuid(body.project_id);
  const plantId = optionalUuid(body.plant_id);
  const residueType = enumValue(body.residue_type, residueTypes);
  const volumeSize = enumValue(body.volume_size, volumeSizes);
  const scheduledAt = isoDate(body.scheduled_at);
  const address = requiredString(body.address, 240);
  const coordinates = parseCoordinates(body.latitude, body.longitude);
  const price = finiteNumber(body.price_cents ?? 0, { min: 0, max: 1_000_000_000 });
  if (!projectId || !residueType || !volumeSize || !scheduledAt || !address || price === null || !coordinates) {
    return errorJson("Datos invalidos para crear la solicitud.", 400);
  }
  const pickupId = randomUUID();
  const passportId = `PAS-${pickupId.replaceAll("-", "").slice(0, 12).toUpperCase()}`;

  const data = await withTransaction(async (client) => {
    const project = await client.query<{ client_id: string }>("select client_id from projects where id = $1", [projectId]);
    if (!project.rows[0] || (user.role !== "admin" && project.rows[0].client_id !== user.id)) {
      throw new Error("Obra no disponible para este usuario.");
    }

    await client.query("update projects set latitude = $1, longitude = $2, address = $3 where id = $4", [coordinates.latitude, coordinates.longitude, address, projectId]);

    const pickup = await client.query(
      `insert into pickup_requests (id, client_id, project_id, plant_id, residue_type, volume_size, scheduled_at, address, price_cents)
       values ($1, $2, $3, nullif($4, '')::uuid, $5, $6, $7, $8, $9)
       returning *`,
      [
        pickupId,
        project.rows[0].client_id,
        projectId,
        plantId ?? "",
        residueType,
        volumeSize,
        scheduledAt,
        address,
        Number.isFinite(price) ? Math.round(price * 100) : 0,
      ],
    );

    await client.query(
      `insert into residue_passports (pickup_request_id, unique_id, qr_code, timestamps)
       values ($1, $2, $3, jsonb_build_object('created', now()))`,
      [pickupId, passportId, `${getAppUrl()}/passport/${passportId}`],
    );

    await client.query(
      `insert into tracking_events (pickup_request_id, user_id, user_role, event_name, status)
       values ($1, $2, $3, 'solicitud creada', 'pendiente')`,
      [pickupId, user.id, user.role],
    );

    return pickup.rows[0];
  });

  await handleOperationalEvent("pickup.created", pickupId, { id: user.id, role: user.role }, { source: "api.pickup_requests" });

  return okJson(data, { status: 201 });
}
