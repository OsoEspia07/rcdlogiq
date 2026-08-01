import "server-only";

import type { PoolClient, QueryResultRow } from "pg";
import { persistDispatchSuggestion } from "@/lib/dispatch-engine";
import { query, withTransaction } from "@/lib/postgres";
import type { ServiceStatus, UserRole } from "@/lib/database.types";

type Actor = {
  id: string;
  role: UserRole;
};

const slaLimitsMinutes = {
  requestToAssignment: 60,
  assignmentToArrival: 180,
  loading: 90,
  transit: 180,
  plantProcessing: 240,
  total: 720,
};

function runQuery<T extends QueryResultRow>(client: PoolClient | undefined, text: string, params: unknown[] = []) {
  return client ? client.query<T>(text, params) : query<T>(text, params);
}

async function insertOperationalEvent(client: PoolClient, eventName: string, pickupRequestId: string, actor: Actor | null, payload: Record<string, unknown> = {}) {
  await client.query(
    `insert into operational_events (event_name, pickup_request_id, actor_id, payload)
     values ($1, $2, $3, $4)`,
    [eventName, pickupRequestId, actor?.id ?? null, payload],
  );
}

async function notifyAdmins(client: PoolClient, type: string, title: string, body: string, pickupRequestId?: string) {
  await client.query(
    `insert into notifications (user_id, role, type, title, body, related_entity, related_entity_id)
     select id, role, $1, $2, $3, 'pickup_request', $4
     from users
     where role = 'admin'`,
    [type, title, body, pickupRequestId ?? null],
  );
}

async function createAlert(client: PoolClient, type: string, severity: "info" | "warning" | "critical", pickupRequestId: string, message: string) {
  await client.query(
    `insert into operational_alerts (type, severity, related_entity, related_entity_id, message)
     select $1, $2, 'pickup_request', $3, $4
     where not exists (
       select 1 from operational_alerts
       where type = $1 and related_entity_id = $3 and status <> 'resolved'
     )`,
    [type, severity, pickupRequestId, message],
  );
}

export async function refreshSlaMetrics(pickupRequestId: string, client?: PoolClient) {
  const result = await runQuery<{
    created_at: string;
    assigned_at: string | null;
    arrived_at: string | null;
    loading_at: string | null;
    loaded_at: string | null;
    plant_received_at: string | null;
    processed_at: string | null;
    finished_at: string | null;
  }>(client,
    `select
      pr.created_at::text,
      min(ta.created_at)::text as assigned_at,
      min(te.created_at) filter (where te.status = 'cargando')::text as arrived_at,
      min(te.created_at) filter (where te.status = 'cargando')::text as loading_at,
      min(te.created_at) filter (where te.status = 'cargado')::text as loaded_at,
      min(te.created_at) filter (where te.status = 'recibido en planta')::text as plant_received_at,
      min(te.created_at) filter (where te.status = 'procesado')::text as processed_at,
      min(te.created_at) filter (where te.status in ('finalizado', 'certificado generado'))::text as finished_at
    from pickup_requests pr
    left join transport_assignments ta on ta.pickup_request_id = pr.id
    left join tracking_events te on te.pickup_request_id = pr.id
    where pr.id = $1
    group by pr.id`,
    [pickupRequestId],
  );
  const row = result.rows[0];
  if (!row) return;

  const minutesBetween = (start?: string | null, end?: string | null) => {
    if (!start || !end) return null;
    return Number(((new Date(end).getTime() - new Date(start).getTime()) / 60000).toFixed(2));
  };

  const requestToAssignment = minutesBetween(row.created_at, row.assigned_at);
  const assignmentToArrival = minutesBetween(row.assigned_at, row.arrived_at);
  const loadingDuration = minutesBetween(row.loading_at, row.loaded_at);
  const transitDuration = minutesBetween(row.loaded_at, row.plant_received_at);
  const plantProcessing = minutesBetween(row.plant_received_at, row.processed_at);
  const total = minutesBetween(row.created_at, row.finished_at) ?? minutesBetween(row.created_at, new Date().toISOString());
  const breached =
    (requestToAssignment ?? 0) > slaLimitsMinutes.requestToAssignment ||
    (assignmentToArrival ?? 0) > slaLimitsMinutes.assignmentToArrival ||
    (loadingDuration ?? 0) > slaLimitsMinutes.loading ||
    (transitDuration ?? 0) > slaLimitsMinutes.transit ||
    (plantProcessing ?? 0) > slaLimitsMinutes.plantProcessing ||
    (total ?? 0) > slaLimitsMinutes.total;

  await runQuery(client,
    `insert into sla_metrics (
      pickup_request_id, request_to_assignment_minutes, assignment_to_arrival_minutes,
      loading_duration_minutes, transit_duration_minutes, plant_processing_duration_minutes,
      total_service_duration_minutes, sla_status, updated_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, now())
    on conflict (pickup_request_id) do update set
      request_to_assignment_minutes = excluded.request_to_assignment_minutes,
      assignment_to_arrival_minutes = excluded.assignment_to_arrival_minutes,
      loading_duration_minutes = excluded.loading_duration_minutes,
      transit_duration_minutes = excluded.transit_duration_minutes,
      plant_processing_duration_minutes = excluded.plant_processing_duration_minutes,
      total_service_duration_minutes = excluded.total_service_duration_minutes,
      sla_status = excluded.sla_status,
      updated_at = now()`,
    [pickupRequestId, requestToAssignment, assignmentToArrival, loadingDuration, transitDuration, plantProcessing, total, breached ? "breached" : "on_track"],
  );
}

async function generateOperationalAlerts(pickupRequestId: string, client: PoolClient) {
  const result = await client.query<{
    id: string;
    status: ServiceStatus;
    created_at: string;
    plant_id: string | null;
    evidence_count: string;
    weight_count: string;
    certificate_count: string;
    sla_status: string | null;
  }>(
    `select
      pr.id,
      pr.status,
      pr.created_at::text,
      pr.plant_id,
      count(distinct ph.id)::text as evidence_count,
      count(distinct wt.id)::text as weight_count,
      count(distinct c.id)::text as certificate_count,
      sm.sla_status
    from pickup_requests pr
    left join photos ph on ph.pickup_request_id = pr.id
    left join weight_tickets wt on wt.pickup_request_id = pr.id
    left join certificates c on c.pickup_request_id = pr.id
    left join sla_metrics sm on sm.pickup_request_id = pr.id
    where pr.id = $1
    group by pr.id, sm.sla_status`,
    [pickupRequestId],
  );
  const row = result.rows[0];
  if (!row) return;

  const ageMinutes = (Date.now() - new Date(row.created_at).getTime()) / 60000;
  if (row.status === "pendiente" && ageMinutes > slaLimitsMinutes.requestToAssignment) {
    await createAlert(client, "unassigned_service", "critical", pickupRequestId, "Servicio sin asignar por encima del tiempo esperado.");
  }
  if (row.sla_status === "breached") {
    await createAlert(client, "sla_breached", "critical", pickupRequestId, "Tiempo operativo excedido o en riesgo alto.");
  }
  if (["cargado", "en transito", "recibido en planta"].includes(row.status) && Number(row.evidence_count) === 0) {
    await createAlert(client, "missing_evidence", "warning", pickupRequestId, "Servicio avanzado sin evidencias cargadas.");
  }
  if (["recibido en planta", "pesado", "procesado"].includes(row.status) && Number(row.weight_count) === 0) {
    await createAlert(client, "missing_weight", "warning", pickupRequestId, "Carga en planta sin peso registrado.");
  }
  if (row.status === "procesado" && Number(row.certificate_count) === 0) {
    await createAlert(client, "pending_certificate", "warning", pickupRequestId, "Material procesado con certificado pendiente.");
  }
}

export async function updateTransporterScore(transporterId: string, client?: PoolClient) {
  await runQuery(client,
    `insert into transporter_scores (
      transporter_id, completed_trips, cancelled_trips, punctuality_score, sla_score,
      cancellation_score, evidence_score, speed_score, score, updated_at
    )
    select
      u.id,
      count(distinct pr.id) filter (where pr.status in ('finalizado', 'certificado generado'))::int as completed_trips,
      count(distinct ta.id) filter (where ta.status = 'rechazado')::int as cancelled_trips,
      greatest(40, 100 - coalesce(avg(greatest(sm.request_to_assignment_minutes - 60, 0)), 0))::numeric(5,2),
      greatest(40, 100 - coalesce(avg(case when sm.sla_status = 'breached' then 30 else 0 end), 0))::numeric(5,2),
      greatest(30, 100 - count(distinct ta.id) filter (where ta.status = 'rechazado') * 15)::numeric(5,2),
      least(100, 60 + count(distinct ph.id) * 5)::numeric(5,2),
      greatest(45, 100 - coalesce(avg(sm.total_service_duration_minutes) / 20, 0))::numeric(5,2),
      0,
      now()
    from users u
    left join transport_assignments ta on ta.transporter_id = u.id
    left join pickup_requests pr on pr.id = ta.pickup_request_id
    left join sla_metrics sm on sm.pickup_request_id = pr.id
    left join photos ph on ph.pickup_request_id = pr.id
    where u.id = $1
    group by u.id
    on conflict (transporter_id) do update set
      completed_trips = excluded.completed_trips,
      cancelled_trips = excluded.cancelled_trips,
      punctuality_score = excluded.punctuality_score,
      sla_score = excluded.sla_score,
      cancellation_score = excluded.cancellation_score,
      evidence_score = excluded.evidence_score,
      speed_score = excluded.speed_score,
      updated_at = now()`,
    [transporterId],
  );
  await runQuery(client,
    `update transporter_scores
     set score = round((punctuality_score * 0.25 + sla_score * 0.25 + cancellation_score * 0.2 + evidence_score * 0.15 + speed_score * 0.15)::numeric, 2)
     where transporter_id = $1`,
    [transporterId],
  );
}

export async function handleOperationalEvent(eventName: string, pickupRequestId: string, actor: Actor | null, payload: Record<string, unknown> = {}) {
  await withTransaction(async (client) => {
    await insertOperationalEvent(client, eventName, pickupRequestId, actor, payload);

    if (eventName === "pickup.created") {
      await persistDispatchSuggestion(pickupRequestId, client);
      await notifyAdmins(client, "dispatch_suggestion", "Nueva solicitud lista para dispatch", "El motor genero una sugerencia automatica.", pickupRequestId);
    }

    if (eventName === "transport.assigned") {
      const assignment = await client.query<{ transporter_id: string }>("select transporter_id from transport_assignments where pickup_request_id = $1", [pickupRequestId]);
      const transporterId = assignment.rows[0]?.transporter_id;
      if (transporterId) {
        await client.query(
          `insert into notifications (user_id, type, title, body, related_entity, related_entity_id)
           values ($1, 'new_assignment', 'Nuevo servicio asignado', 'Tienes un servicio pendiente por aceptar.', 'pickup_request', $2)`,
          [transporterId, pickupRequestId],
        );
      }
    }

    if (eventName === "transport.rejected" || eventName === "vehicle.failed") {
      await persistDispatchSuggestion(pickupRequestId, client);
      await createAlert(client, "auto_reassignment", "warning", pickupRequestId, "Se requiere reasignacion automatica o revision de dispatch.");
      await notifyAdmins(client, "auto_reassignment", "Reasignacion requerida", "El sistema preparo una nueva sugerencia.", pickupRequestId);
    }

    await refreshSlaMetrics(pickupRequestId, client);
    await generateOperationalAlerts(pickupRequestId, client);

    const assignment = await client.query<{ transporter_id: string }>("select transporter_id from transport_assignments where pickup_request_id = $1", [pickupRequestId]);
    if (assignment.rows[0]?.transporter_id) {
      await updateTransporterScore(assignment.rows[0].transporter_id, client);
    }
  });
}
