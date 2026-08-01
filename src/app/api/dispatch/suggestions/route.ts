import { errorJson, okJson } from "@/lib/api-response";
import { persistDispatchSuggestion, suggestPlant, suggestTransporter } from "@/lib/dispatch-engine";
import { query, withTransaction } from "@/lib/postgres";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/session";
import { requiredUuid } from "@/lib/validation";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);
  const denied = await requirePermission(user, "pickup.assign");
  if (denied) return denied;

  const pickupRequestId = new URL(request.url).searchParams.get("pickup_request_id");
  if (!pickupRequestId) {
    const result = await query(
      `select ds.*, coalesce(tu.company_name, tu.full_name) as transporter, v.plate, p.name as plant
       from dispatch_suggestions ds
       left join users tu on tu.id = ds.transporter_id
       left join vehicles v on v.id = ds.vehicle_id
       left join plants p on p.id = ds.plant_id
       order by ds.created_at desc
       limit 30`,
    );
    return okJson(result.rows);
  }
  if (!requiredUuid(pickupRequestId)) return errorJson("Solicitud invalida.", 400);

  const [transporter, plant] = await Promise.all([suggestTransporter(pickupRequestId), suggestPlant(pickupRequestId)]);
  return okJson({ transporter, plant });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);
  const limited = await enforceRateLimit({ key: rateLimitKey("api_mutable", user.id), limit: 100, windowMs: 60_000, type: "api_mutable", userId: user.id });
  if (limited) return limited;
  const denied = await requirePermission(user, "pickup.assign");
  if (denied) return denied;

  const body = await request.json();
  const pickupRequestId = requiredUuid(body.pickup_request_id);
  if (!pickupRequestId) return errorJson("Solicitud invalida.", 400);
  const data = await withTransaction((client) => persistDispatchSuggestion(pickupRequestId, client));
  return okJson(data, { status: 201 });
}
