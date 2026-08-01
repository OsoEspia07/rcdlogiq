import { errorJson, okJson } from "@/lib/api-response";
import { handleOperationalEvent } from "@/lib/operations-engine";
import { withTransaction } from "@/lib/postgres";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/session";
import { optionalUuid, requiredUuid } from "@/lib/validation";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);
  const limited = await enforceRateLimit({ key: rateLimitKey("api_mutable", user.id), limit: 100, windowMs: 60_000, type: "api_mutable", userId: user.id });
  if (limited) return limited;
  const denied = await requirePermission(user, "pickup.assign");
  if (denied) return denied;

  const body = await request.json();
  const pickupRequestId = requiredUuid(body.pickup_request_id);
  const transporterId = requiredUuid(body.transporter_id);
  const vehicleId = optionalUuid(body.vehicle_id);
  const plantId = requiredUuid(body.plant_id);
  if (!pickupRequestId || !transporterId || !plantId) return errorJson("Datos de asignacion invalidos.", 400);

  const data = await withTransaction(async (client) => {
    const valid = await client.query<{ ok: boolean }>(
      `select exists (
        select 1
        from pickup_requests pr
        join users u on u.id = $2 and u.role = 'transportador'
        join plants p on p.id = $4 and p.active = true
        left join vehicles v on v.id = $3 and v.transporter_id = $2 and v.active = true
        where pr.id = $1 and ($3::uuid is null or v.id is not null)
      ) as ok`,
      [pickupRequestId, transporterId, vehicleId, plantId],
    );
    if (!valid.rows[0]?.ok) throw new Error("Asignacion invalida.");
    await client.query("update pickup_requests set plant_id = $1, status = 'asignado', updated_at = now() where id = $2", [plantId, pickupRequestId]);
    const assignment = await client.query(
      `insert into transport_assignments (pickup_request_id, transporter_id, vehicle_id, status)
       values ($1, $2, $3, 'asignado')
       on conflict (pickup_request_id) do update
       set transporter_id = excluded.transporter_id,
           vehicle_id = excluded.vehicle_id,
           status = 'asignado',
           rejected_at = null
       returning *`,
      [pickupRequestId, transporterId, vehicleId],
    );
    await client.query(
      `insert into tracking_events (pickup_request_id, user_id, user_role, event_name, status, metadata)
       values ($1, $2, $3, 'servicio asignado', 'asignado', jsonb_build_object('transporter_id', $4::text, 'vehicle_id', $5::text, 'plant_id', $6::text))`,
      [pickupRequestId, user.id, user.role, transporterId, vehicleId, plantId],
    );
    return assignment.rows[0];
  });

  await handleOperationalEvent("transport.assigned", pickupRequestId, { id: user.id, role: user.role }, { transporter_id: transporterId, vehicle_id: vehicleId, plant_id: plantId });

  return okJson(data, { status: 201 });
}
