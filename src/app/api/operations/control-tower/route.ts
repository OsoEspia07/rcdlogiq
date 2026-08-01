import { errorJson, okJson } from "@/lib/api-response";
import { query } from "@/lib/postgres";
import { requirePermission } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorJson("No autenticado.", 401);
  const denied = await requirePermission(user, "pickup.read.all");
  if (denied) return denied;

  const [alerts, sla, analytics, events] = await Promise.all([
    query("select * from operational_alerts where status <> 'resolved' order by created_at desc limit 20"),
    query("select * from sla_metrics order by updated_at desc limit 20"),
    query("select * from operations_analytics order by services desc limit 20"),
    query("select * from operational_events order by created_at desc limit 30"),
  ]);

  return okJson({
      alerts: alerts.rows,
      sla: sla.rows,
      analytics: analytics.rows,
      events: events.rows,
  });
}
