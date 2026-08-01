import { errorJson, okJson } from "@/lib/api-response";
import { handleOperationalEvent } from "@/lib/operations-engine";
import { query } from "@/lib/postgres";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/session";
import { finiteNumber, optionalUuid, requiredUuid } from "@/lib/validation";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);
  const denied = await requirePermission(user, "tracking.read");
  if (denied) return denied;

  const vehicleId = new URL(request.url).searchParams.get("vehicle_id");
  if (vehicleId && !requiredUuid(vehicleId)) return errorJson("Vehiculo invalido.", 400);
  const result = await query(
    `select vl.*, v.plate
     from vehicle_locations vl
     join vehicles v on v.id = vl.vehicle_id
     left join transport_assignments ta on ta.vehicle_id = v.id
     left join pickup_requests pr on pr.id = ta.pickup_request_id
     left join plants p on p.id = pr.plant_id
     where ($1::uuid is null or vl.vehicle_id = $1::uuid)
       and (
         $2 = 'admin'
         or v.transporter_id = $3
         or p.owner_id = $3
       )
     order by vl.timestamp desc
     limit 100`,
    [vehicleId, user.role, user.id],
  );
  return okJson(result.rows);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);
  const limited = await enforceRateLimit({ key: rateLimitKey("tracking", user.id), limit: 30, windowMs: 60_000, type: "tracking", userId: user.id });
  if (limited) return limited;
  const denied = await requirePermission(user, "tracking.update");
  if (denied) return denied;

  const body = await request.json();
  const vehicleId = requiredUuid(body.vehicle_id);
  const lat = finiteNumber(body.lat, { min: -90, max: 90 });
  const lng = finiteNumber(body.lng, { min: -180, max: 180 });
  const pickupRequestId = optionalUuid(body.pickup_request_id);
  if (!vehicleId || lat === null || lng === null) return errorJson("Ubicacion invalida.", 400);
  const allowedVehicle = await query<{ allowed: boolean }>(
    `select exists (
      select 1 from vehicles
      where id = $1 and ($2 = 'admin' or transporter_id = $3)
    ) as allowed`,
    [vehicleId, user.role, user.id],
  );
  if (!allowedVehicle.rows[0]?.allowed) return errorJson("Vehiculo no disponible para este usuario.", 403);
  const result = await query(
    `insert into vehicle_locations (vehicle_id, lat, lng, speed, heading)
     values ($1, $2, $3, $4, $5)
     returning *`,
    [vehicleId, lat, lng, finiteNumber(body.speed, { min: 0, max: 180 }), finiteNumber(body.heading, { min: 0, max: 360 })],
  );
  await query("update vehicles set current_latitude = $2, current_longitude = $3 where id = $1", [vehicleId, lat, lng]);
  if (pickupRequestId) {
    await handleOperationalEvent("vehicle.location.updated", pickupRequestId, { id: user.id, role: user.role }, { vehicle_id: vehicleId, lat, lng });
  }
  return okJson(result.rows[0], { status: 201 });
}
