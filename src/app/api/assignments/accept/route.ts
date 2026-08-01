import { errorJson, okJson } from "@/lib/api-response";
import { handleOperationalEvent } from "@/lib/operations-engine";
import { withTransaction } from "@/lib/postgres";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";
import { optionalUuid, requiredUuid } from "@/lib/validation";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);
  if (user.role !== "transportador") return errorJson("Solo transportadores pueden aceptar servicios disponibles.", 403);

  const limited = await enforceRateLimit({ key: rateLimitKey("api_mutable", user.id), limit: 100, windowMs: 60_000, type: "api_mutable", userId: user.id });
  if (limited) return limited;

  const body = await request.json();
  const pickupRequestId = requiredUuid(body.pickup_request_id);
  const requestedVehicleId = optionalUuid(body.vehicle_id);
  if (!pickupRequestId) return errorJson("Servicio invalido.", 400);
  if (body.vehicle_id && !requestedVehicleId) return errorJson("Vehiculo invalido.", 400);

  try {
    const assignment = await withTransaction(async (client) => {
      const pickup = await client.query<{ id: string; status: string; plant_id: string | null }>(
        "select id, status, plant_id from pickup_requests where id = $1 for update",
        [pickupRequestId],
      );
      if (!pickup.rows[0]) throw new Error("El servicio no existe.");
      if (pickup.rows[0].status !== "pendiente") throw new Error("El servicio ya no esta disponible.");

      const existing = await client.query<{ exists: boolean }>("select exists (select 1 from transport_assignments where pickup_request_id = $1) as exists", [pickupRequestId]);
      if (existing.rows[0]?.exists) throw new Error("El servicio ya fue tomado.");

      const vehicle = requestedVehicleId
        ? await client.query<{ id: string }>("select id from vehicles where id = $1 and transporter_id = $2 and active = true", [requestedVehicleId, user.id])
        : await client.query<{ id: string }>("select id from vehicles where transporter_id = $1 and active = true order by created_at desc limit 1", [user.id]);
      const vehicleId = vehicle.rows[0]?.id;
      if (!vehicleId) throw new Error("Registra un vehiculo activo antes de aceptar servicios.");

      await client.query(
        `insert into plants (
          name,
          authorization_code,
          address,
          city,
          latitude,
          longitude,
          accepted_residue_types,
          daily_capacity_tons,
          operational_status,
          active
        )
        values (
          'Quarzium S.A.S',
          'QUARZIUM-SOACHA-001',
          'Cra. 13 #4B - 35, Soacha, Cundinamarca',
          'Soacha',
          4.5706991,
          -74.2396968,
          array['concreto','ladrillo','mixto','madera','drywall','metal','otros']::residue_type[],
          120,
          'operativa',
          true
        )
        on conflict (authorization_code) do update
        set name = excluded.name,
            address = excluded.address,
            city = excluded.city,
            latitude = excluded.latitude,
            longitude = excluded.longitude,
            accepted_residue_types = excluded.accepted_residue_types,
            daily_capacity_tons = excluded.daily_capacity_tons,
            operational_status = excluded.operational_status,
            active = true`,
      );
      const plant = pickup.rows[0].plant_id
        ? await client.query<{ id: string }>("select id from plants where id = $1 and active = true", [pickup.rows[0].plant_id])
        : await client.query<{ id: string }>("select id from plants where authorization_code = 'QUARZIUM-SOACHA-001' and active = true limit 1");
      const plantId = plant.rows[0]?.id;
      if (!plantId) throw new Error("No hay planta activa disponible para este servicio.");

      await client.query("update pickup_requests set plant_id = $1, status = 'aceptado', updated_at = now() where id = $2", [plantId, pickupRequestId]);
      const result = await client.query(
        `insert into transport_assignments (pickup_request_id, transporter_id, vehicle_id, status, accepted_at)
         values ($1, $2, $3, 'aceptado', now())
         returning *`,
        [pickupRequestId, user.id, vehicleId],
      );
      await client.query(
        `insert into tracking_events (pickup_request_id, user_id, user_role, event_name, status, metadata)
         values ($1, $2, $3, 'servicio aceptado por transportador', 'aceptado', jsonb_build_object('vehicle_id', $4::text, 'plant_id', $5::text))`,
        [pickupRequestId, user.id, user.role, vehicleId, plantId],
      );
      return result.rows[0];
    });

    await handleOperationalEvent("transport.accepted", pickupRequestId, { id: user.id, role: user.role }, { assignment_id: assignment.id });
    return okJson(assignment, { status: 201 });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "No se pudo aceptar el servicio.", 400);
  }
}
