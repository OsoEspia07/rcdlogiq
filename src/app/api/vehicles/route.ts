import { errorJson, okJson } from "@/lib/api-response";
import { query } from "@/lib/postgres";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";
import { cleanString, finiteNumber, requiredString, requiredUuid } from "@/lib/validation";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);
  if (user.role !== "transportador" && user.role !== "admin") return errorJson("Rol no autorizado.", 403);

  const limited = await enforceRateLimit({ key: rateLimitKey("api_mutable", user.id), limit: 100, windowMs: 60_000, type: "api_mutable", userId: user.id });
  if (limited) return limited;

  const body = await request.json();
  const transporterId = user.role === "admin" ? requiredUuid(body.transporter_id) : user.id;
  const plate = requiredString(body.plate, 20)?.toUpperCase().replace(/\s+/g, "");
  const vehicleType = requiredString(body.vehicle_type, 80);
  const capacityTons = finiteNumber(body.capacity_tons, { min: 0.1, max: 100 });
  const city = cleanString(body.city ?? "Bogota", 80) || "Bogota";

  if (!transporterId || !plate || !vehicleType || capacityTons === null) {
    return errorJson("Datos invalidos para registrar el vehiculo.", 400);
  }

  const transporter = await query<{ ok: boolean }>("select exists (select 1 from users where id = $1 and role = 'transportador') as ok", [transporterId]);
  if (!transporter.rows[0]?.ok) return errorJson("Transportador invalido.", 400);

  try {
    const result = await query(
      `insert into vehicles (transporter_id, plate, capacity_tons, vehicle_type, city, documents, active)
       values ($1, $2, $3, $4, $5, '[]'::jsonb, true)
       returning id, plate, capacity_tons, vehicle_type, city, active`,
      [transporterId, plate, capacityTons, vehicleType, city],
    );
    return okJson(result.rows[0], { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("duplicate")) {
      return errorJson("Ya existe un vehiculo con esa placa.", 409);
    }
    throw error;
  }
}
