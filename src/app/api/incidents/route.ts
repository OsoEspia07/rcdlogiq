import { errorJson, okJson } from "@/lib/api-response";
import { handleOperationalEvent } from "@/lib/operations-engine";
import { query, withTransaction } from "@/lib/postgres";
import { enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/session";
import { cleanString, optionalUuid, requiredUuid } from "@/lib/validation";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);
  const denied = await requirePermission(user, user.role === "admin" ? "pickup.read.all" : "pickup.read.own");
  if (denied) return denied;

  const result = await query(
    `select i.*, u.full_name as assigned_to_name
     from incidents i
     left join pickup_requests pr on pr.id = i.pickup_request_id
     left join transport_assignments ta on ta.pickup_request_id = pr.id
     left join plants p on p.id = pr.plant_id
     left join users u on u.id = i.assigned_to
     where $1 = 'admin'
        or pr.client_id = $2
        or ta.transporter_id = $2
        or p.owner_id = $2
        or i.created_by = $2
     order by i.created_at desc
     limit 50`,
    [user.role, user.id],
  );
  return okJson(result.rows);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);
  const limited = await enforceRateLimit({ key: rateLimitKey("api_mutable", user.id), limit: 100, windowMs: 60_000, type: "api_mutable", userId: user.id });
  if (limited) return limited;
  const denied = await requirePermission(user, "tracking.update");
  if (denied) return denied;

  const body = await request.json();
  const pickupRequestId = optionalUuid(body.pickup_request_id);
  const type = cleanString(body.type ?? "retraso", 60) || "retraso";
  const severity = ["info", "warning", "critical"].includes(String(body.severity)) ? String(body.severity) : "warning";
  const assignedTo = optionalUuid(body.assigned_to);
  const description = cleanString(body.description, 1000);
  if (!description) return errorJson("La descripcion del incidente es requerida.", 400);
  const data = await withTransaction(async (client) => {
    const incident = await client.query(
      `insert into incidents (pickup_request_id, type, severity, assigned_to, description, created_by)
       values ($1, $2, $3, nullif($4, '')::uuid, $5, $6)
       returning *`,
      [pickupRequestId, type, severity, assignedTo ?? "", description, user.id],
    );
    if (pickupRequestId) {
      await client.query(
        `insert into operational_alerts (type, severity, related_entity, related_entity_id, message)
         values ('incident_created', $1, 'pickup_request', $2, $3)`,
        [severity, pickupRequestId, description],
      );
    }
    return incident.rows[0];
  });

  if (pickupRequestId) await handleOperationalEvent("incident.created", pickupRequestId, { id: user.id, role: user.role }, { incident_id: data.id, type: data.type });
  return okJson(data, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);
  const limited = await enforceRateLimit({ key: rateLimitKey("api_mutable", user.id), limit: 100, windowMs: 60_000, type: "api_mutable", userId: user.id });
  if (limited) return limited;
  const denied = await requirePermission(user, "tracking.update");
  if (denied) return denied;

  const body = await request.json();
  const id = requiredUuid(body.id);
  const status = ["open", "assigned", "resolved"].includes(String(body.status)) ? String(body.status) : null;
  const assignedTo = optionalUuid(body.assigned_to);
  const resolution = cleanString(body.resolution, 1000);
  if (!id || !status) return errorJson("Incidente o estado invalido.", 400);
  const result = await query(
    `update incidents
     set status = $2,
         assigned_to = coalesce(nullif($3, '')::uuid, assigned_to),
         resolution = coalesce(nullif($4, ''), resolution),
         resolved_at = case when $2 = 'resolved' then now() else resolved_at end
     where id = $1
     returning *`,
    [id, status, assignedTo ?? "", resolution],
  );
  return okJson(result.rows[0] ?? null);
}
