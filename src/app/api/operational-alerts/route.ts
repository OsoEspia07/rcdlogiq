import { errorJson, okJson } from "@/lib/api-response";
import { query } from "@/lib/postgres";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/session";
import { requiredUuid } from "@/lib/validation";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);
  const denied = await requirePermission(user, "pickup.assign");
  if (denied) return denied;

  const result = await query(
    `select *
     from operational_alerts
     where status <> 'resolved'
     order by case severity when 'critical' then 1 when 'warning' then 2 else 3 end, created_at desc
     limit 50`,
  );
  return okJson(result.rows);
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);
  const limited = await enforceRateLimit({ key: rateLimitKey("api_mutable", user.id), limit: 100, windowMs: 60_000, type: "api_mutable", userId: user.id });
  if (limited) return limited;
  const denied = await requirePermission(user, "pickup.assign");
  if (denied) return denied;

  const body = await request.json();
  const id = requiredUuid(body.id);
  const status = ["open", "acknowledged", "resolved"].includes(String(body.status)) ? String(body.status) : null;
  if (!id || !status) return errorJson("Alerta o estado invalido.", 400);
  const result = await query(
    `update operational_alerts
     set status = $2, resolved_at = case when $2 = 'resolved' then now() else resolved_at end
     where id = $1
     returning *`,
    [id, status],
  );
  return okJson(result.rows[0] ?? null);
}
