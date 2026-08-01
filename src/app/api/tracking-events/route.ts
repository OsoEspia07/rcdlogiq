import { errorJson, okJson } from "@/lib/api-response";
import { handleOperationalEvent } from "@/lib/operations-engine";
import { withTransaction } from "@/lib/postgres";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { canAccessPickup, canTransition, getPickupStatus, requirePermission } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/session";
import { cleanString, databaseServiceStatuses, enumValue, finiteNumber, optionalUuid, requiredUuid } from "@/lib/validation";
import { validateStateRequirements } from "@/lib/workflow-guards";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);
  const limited = await enforceRateLimit({ key: rateLimitKey("tracking", user.id), limit: 30, windowMs: 60_000, type: "tracking", userId: user.id });
  if (limited) return limited;

  const body = await request.json();
  const pickupRequestId = requiredUuid(body.pickup_request_id);
  const nextStatus = body.status ? enumValue(body.status, databaseServiceStatuses) : null;
  const eventNameText = cleanString(body.event_name ?? "evento logistico", 120);
  if (!pickupRequestId || (body.status && !nextStatus) || !eventNameText) return errorJson("Datos de tracking invalidos.", 400);
  const permission = user.role === "cliente" && nextStatus === "finalizado" ? "pickup.cancel.own" : "tracking.update";
  const denied = await requirePermission(user, permission);
  if (denied) return denied;
  const allowed = await canAccessPickup(user, pickupRequestId);
  if (!allowed) return errorJson("Solicitud no disponible para este rol.", 403);
  const currentStatus = await getPickupStatus(pickupRequestId);
  if (!currentStatus) return errorJson("Solicitud no encontrada.", 404);
  if (nextStatus && !canTransition(user.role, currentStatus, nextStatus)) {
    return errorJson(`Transicion no permitida para ${user.role}: ${currentStatus} -> ${nextStatus}.`, 403);
  }
  if (nextStatus) {
    const requirementError = await validateStateRequirements({ pickupRequestId, role: user.role, from: currentStatus, to: nextStatus });
    if (requirementError) return errorJson(requirementError, 409);
  }
  const latitude = body.latitude === undefined || body.latitude === null ? null : finiteNumber(body.latitude, { min: -90, max: 90 });
  const longitude = body.longitude === undefined || body.longitude === null ? null : finiteNumber(body.longitude, { min: -180, max: 180 });
  if ((body.latitude !== undefined && latitude === null) || (body.longitude !== undefined && longitude === null)) return errorJson("Coordenadas invalidas.", 400);
  const vehicleId = optionalUuid(body.vehicle_id);

  const data = await withTransaction(async (client) => {
    if (nextStatus) {
      await client.query("update pickup_requests set status = $1, updated_at = now() where id = $2", [nextStatus, pickupRequestId]);
      if (nextStatus === "aceptado") {
        await client.query("update transport_assignments set status = 'aceptado', accepted_at = now(), rejected_at = null where pickup_request_id = $1", [pickupRequestId]);
      }
      if (nextStatus === "pendiente" && eventNameText.includes("rechaz")) {
        await client.query("update transport_assignments set status = 'rechazado', rejected_at = now() where pickup_request_id = $1", [pickupRequestId]);
      }
    }

    const event = await client.query(
      `insert into tracking_events (pickup_request_id, user_id, user_role, event_name, status, latitude, longitude, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning *`,
      [pickupRequestId, user.id, user.role, eventNameText, nextStatus, latitude, longitude, body.metadata && typeof body.metadata === "object" ? body.metadata : {}],
    );

    if (vehicleId && latitude !== null && longitude !== null) {
      await client.query(
        `insert into vehicle_locations (vehicle_id, lat, lng, speed, heading)
         values ($1, $2, $3, $4, $5)`,
        [vehicleId, latitude, longitude, finiteNumber(body.speed, { min: 0, max: 180 }), finiteNumber(body.heading, { min: 0, max: 360 })],
      );
      await client.query(
        `update vehicles
         set current_latitude = $2, current_longitude = $3
         where id = $1`,
        [vehicleId, latitude, longitude],
      );
    }

    await client.query(
      `update residue_passports
       set timestamps = timestamps || jsonb_build_object(replace(coalesce($2::text, $3), ' ', '_'), now()),
           geo_locations = geo_locations || jsonb_build_array(jsonb_build_object('event', $3::text, 'lat', $4::numeric, 'lng', $5::numeric, 'created_at', now()))
       where pickup_request_id = $1`,
      [pickupRequestId, nextStatus, eventNameText, latitude, longitude],
    );

    return event.rows[0];
  });

  const eventNameByStatus: Record<string, string> = {
    aceptado: "transport.accepted",
    "en camino": "vehicle.departed",
    cargando: "vehicle.arrived",
    cargado: "loading.completed",
    "en transito": "vehicle.in_transit",
    "recibido en planta": "plant.received",
    pesado: "weight.registered",
    procesado: "plant.processed",
    "certificado generado": "certificate.generated",
  };
  const eventName = eventNameText.includes("rechaz") ? "transport.rejected" : eventNameByStatus[String(nextStatus)] ?? "tracking.updated";
  await handleOperationalEvent(eventName, pickupRequestId, { id: user.id, role: user.role }, { status: nextStatus });

  return okJson(data, { status: 201 });
}
