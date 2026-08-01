import { errorJson, okJson } from "@/lib/api-response";
import { query } from "@/lib/postgres";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";
import { geocodeAddress, parseCoordinates } from "@/lib/geo";
import { requiredString } from "@/lib/validation";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);
  const limited = await enforceRateLimit({ key: rateLimitKey("api_mutable", user.id), limit: 100, windowMs: 60_000, type: "api_mutable", userId: user.id });
  if (limited) return limited;
  if (user.role !== "cliente" && user.role !== "admin") return errorJson("Rol no autorizado.", 403);

  const body = await request.json();
  const name = requiredString(body.name, 120);
  const address = requiredString(body.address, 240);
  const city = requiredString(body.city ?? "Bogota", 80);
  if (!name || !address || !city) return errorJson("Nombre, direccion y ciudad son requeridos.", 400);
  const coordinates = parseCoordinates(body.latitude, body.longitude) ?? (await geocodeAddress(address, city));
  const result = await query(
    `insert into projects (client_id, name, address, city, latitude, longitude)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [user.id, name, address, city, coordinates.latitude, coordinates.longitude],
  );

  return okJson(result.rows[0], { status: 201 });
}
