import type { ServiceStatus, UserRole } from "@/lib/database.types";
import { query } from "@/lib/postgres";
import { visibilityPredicate } from "@/lib/rbac";
import { getCurrentUser, type CurrentUser } from "@/lib/session";

export type DashboardService = {
  id: string;
  plantId: string | null;
  transporterId: string | null;
  vehicleId: string | null;
  passportId: string | null;
  qrCode: string | null;
  client: string;
  project: string;
  address: string;
  residue: string;
  volume: string;
  status: ServiceStatus;
  transporter: string;
  vehicle: string;
  vehicleLatitude: number | null;
  vehicleLongitude: number | null;
  plant: string;
  netWeightKg: number | null;
  priceCents: number;
  evidenceCount: number;
  createdAt: string;
  scheduledAt: string;
  timeline: Array<{
    id: string;
    event: string;
    status: ServiceStatus | null;
    createdAt: string;
    actor: string | null;
    role: UserRole | null;
    latitude: number | null;
    longitude: number | null;
  }>;
  photos: Array<{
    id: string;
    kind: string;
    url: string;
    createdAt: string;
  }>;
  certificateUrl: string | null;
  projectLatitude: number | null;
  projectLongitude: number | null;
  plantLatitude: number | null;
  plantLongitude: number | null;
};

export type DashboardOption = {
  id: string;
  label: string;
  meta?: string | null;
  photoUrl?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  driverDocument?: string | null;
  licenseStatus?: string | null;
  consentStatus?: string | null;
};

export type DashboardStats = {
  services: number;
  active: number;
  pending: number;
  inTransit: number;
  tonsToday: number;
  revenueToday: number;
  certificatesToday: number;
};

export type ControlTowerData = {
  alerts: Array<{
    id: string;
    type: string;
    severity: "info" | "warning" | "critical";
    message: string;
    created_at: string;
  }>;
  sla: Array<{
    pickup_request_id: string;
    sla_status: string;
    request_to_assignment_minutes: string | null;
    total_service_duration_minutes: string | null;
    updated_at: string;
  }>;
  suggestions: Array<{
    id: string;
    pickup_request_id: string;
    transporter: string | null;
    plate: string | null;
    plant: string | null;
    transporter_score: string | null;
    plant_score: string | null;
    eta_minutes: number | null;
    distance_km: string | null;
    created_at: string;
  }>;
  analytics: Array<{
    city: string;
    residue_type: string;
    services: number;
    kg_collected: string;
    avg_service_minutes: string | null;
    active_services: number;
  }>;
};

type DashboardRow = {
  id: string;
  plant_id: string | null;
  transporter_id: string | null;
  vehicle_id: string | null;
  passport_id: string | null;
  qr_code: string | null;
  client: string;
  project: string;
  address: string;
  residue: string;
  volume: string;
  status: ServiceStatus;
  transporter: string | null;
  vehicle: string | null;
  vehicle_latitude: string | null;
  vehicle_longitude: string | null;
  plant: string | null;
  net_weight_kg: string | null;
  price_cents: number;
  evidence_count: string;
  created_at: string;
  scheduled_at: string;
  timeline: Array<{ id: string; event: string; status: ServiceStatus | null; createdAt: string; actor: string | null; role: UserRole | null; latitude: string | null; longitude: string | null }> | null;
  photos: Array<{ id: string; kind: string; path: string; createdAt: string }> | null;
  certificate_url: string | null;
  project_latitude: string | null;
  project_longitude: string | null;
  plant_latitude: string | null;
  plant_longitude: string | null;
};

function visibilityWhere(user: CurrentUser, alias = "pr") {
  return visibilityPredicate(user, alias);
}

function maskDocument(value: string | null) {
  if (!value) return null;
  const clean = value.replace(/\D/g, "");
  if (clean.length <= 4) return "****";
  return `${clean.slice(0, 3)}****${clean.slice(-2)}`;
}

function maskPhone(value: string | null) {
  if (!value) return null;
  const clean = value.replace(/\D/g, "");
  if (clean.length <= 4) return "****";
  return `***${clean.slice(-4)}`;
}

type VehicleOptionRow = {
  id: string;
  label: string;
  meta: string | null;
  photo_path: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  driver_identification: string | null;
  license_number: string | null;
  consent_status: string | null;
};

function fileUrl(storagePath: string | null) {
  if (!storagePath) return null;
  const normalized = storagePath.replaceAll("\\", "/").replace(/^\/+/, "");
  const withStoragePrefix = normalized.startsWith("storage/") ? normalized : `storage/${normalized}`;
  return `/api/files/${withStoragePrefix.split("/").map(encodeURIComponent).join("/")}`;
}

function mapVehicleOption(row: VehicleOptionRow, canViewOwnPrivateData: boolean): DashboardOption {
  return {
    id: row.id,
    label: row.label,
    meta: row.meta,
    photoUrl: fileUrl(row.photo_path),
    driverName: row.driver_name,
    driverPhone: canViewOwnPrivateData ? row.driver_phone : maskPhone(row.driver_phone),
    driverDocument: canViewOwnPrivateData ? row.driver_identification : maskDocument(row.driver_identification),
    licenseStatus: row.license_number === "PENDIENTE-DEMO" ? "Licencia pendiente" : row.license_number ? "Licencia registrada" : "Sin licencia",
    consentStatus: row.consent_status ?? "Sin consentimiento",
  };
}

export async function getCurrentUserContext() {
  const user = await getCurrentUser();
  return { user, profile: user };
}

export async function getDashboardData(role?: UserRole) {
  const user = await getCurrentUser();
  if (!user) {
    return {
      services: [],
      availableServices: [],
      plants: [],
      projects: [],
      transporters: [],
      vehicles: [],
      analytics: null,
      controlTower: { alerts: [], sla: [], suggestions: [], analytics: [] },
      stats: { services: 0, active: 0, pending: 0, inTransit: 0, tonsToday: 0, revenueToday: 0, certificatesToday: 0 },
    };
  }

  const visibility = visibilityWhere(user);
  const servicesResult = await query<DashboardRow>(
    `select
      pr.id,
      pr.plant_id,
      ta.transporter_id,
      ta.vehicle_id,
      rp.unique_id as passport_id,
      rp.qr_code,
      cu.full_name as client,
      pj.name as project,
      pr.address,
      pr.residue_type::text as residue,
      pr.volume_size::text as volume,
      pr.status,
      coalesce(tu.company_name, tu.full_name) as transporter,
      v.plate as vehicle,
      v.current_latitude::text as vehicle_latitude,
      v.current_longitude::text as vehicle_longitude,
      pl.name as plant,
      coalesce(wt.net_weight_kg, rp.final_weight_kg)::text as net_weight_kg,
      pr.price_cents,
      count(distinct ph.id)::text as evidence_count,
      c.public_url as certificate_url,
      pr.created_at::text,
      pr.scheduled_at::text,
      pj.latitude::text as project_latitude,
      pj.longitude::text as project_longitude,
      pl.latitude::text as plant_latitude,
      pl.longitude::text as plant_longitude,
      coalesce(
        jsonb_agg(distinct jsonb_build_object('id', te.id, 'event', te.event_name, 'status', te.status, 'createdAt', te.created_at, 'actor', eu.full_name, 'role', te.user_role, 'latitude', te.latitude::text, 'longitude', te.longitude::text)) filter (where te.id is not null),
        '[]'::jsonb
      ) as timeline,
      coalesce(
        jsonb_agg(distinct jsonb_build_object('id', ph.id, 'kind', ph.kind, 'path', ph.storage_path, 'createdAt', ph.created_at)) filter (where ph.id is not null),
        '[]'::jsonb
      ) as photos
    from pickup_requests pr
    join users cu on cu.id = pr.client_id
    join projects pj on pj.id = pr.project_id
    left join plants pl on pl.id = pr.plant_id
    left join residue_passports rp on rp.pickup_request_id = pr.id
    left join photos ph on ph.pickup_request_id = pr.id
    left join certificates c on c.pickup_request_id = pr.id
    left join weight_tickets wt on wt.pickup_request_id = pr.id and wt.approved_at is not null
    left join tracking_events te on te.pickup_request_id = pr.id
    left join users eu on eu.id = te.user_id
    left join transport_assignments ta on ta.pickup_request_id = pr.id
    left join users tu on tu.id = ta.transporter_id
    left join vehicles v on v.id = ta.vehicle_id
    where ${visibility.sql}
    group by pr.id, pr.plant_id, ta.transporter_id, ta.vehicle_id, rp.unique_id, rp.qr_code, cu.full_name, pj.name, pj.latitude, pj.longitude, tu.company_name, tu.full_name, v.plate, v.current_latitude, v.current_longitude, pl.name, pl.latitude, pl.longitude, wt.net_weight_kg, rp.final_weight_kg, c.public_url
    order by pr.created_at desc`,
    visibility.params,
  );

  const mapDashboardService = (row: DashboardRow): DashboardService => ({
    id: row.id,
    plantId: row.plant_id,
    transporterId: row.transporter_id,
    vehicleId: row.vehicle_id,
    passportId: row.passport_id,
    qrCode: row.qr_code,
    client: row.client,
    project: row.project,
    address: row.address,
    residue: row.residue,
    volume: row.volume,
    status: row.status,
    transporter: row.transporter ?? "Transportador pendiente",
    vehicle: row.vehicle ?? "Vehiculo pendiente",
    vehicleLatitude: row.vehicle_latitude ? Number(row.vehicle_latitude) : null,
    vehicleLongitude: row.vehicle_longitude ? Number(row.vehicle_longitude) : null,
    plant: row.plant ?? "Planta pendiente",
    netWeightKg: row.net_weight_kg ? Number(row.net_weight_kg) : null,
    priceCents: row.price_cents,
    evidenceCount: Number(row.evidence_count),
    certificateUrl: row.certificate_url,
    createdAt: row.created_at,
    scheduledAt: row.scheduled_at,
    timeline: (row.timeline ?? [])
      .map((event) => ({ ...event, latitude: event.latitude ? Number(event.latitude) : null, longitude: event.longitude ? Number(event.longitude) : null }))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    photos: (row.photos ?? [])
      .map((photo) => ({ id: photo.id, kind: photo.kind, url: fileUrl(photo.path) ?? "#", createdAt: photo.createdAt }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    projectLatitude: row.project_latitude ? Number(row.project_latitude) : null,
    projectLongitude: row.project_longitude ? Number(row.project_longitude) : null,
    plantLatitude: row.plant_latitude ? Number(row.plant_latitude) : null,
    plantLongitude: row.plant_longitude ? Number(row.plant_longitude) : null,
  });

  const services = servicesResult.rows.map(mapDashboardService);

  const availableServices =
    user.role === "transportador"
      ? (
          await query<DashboardRow>(
            `select
              pr.id,
              pr.plant_id,
              null::uuid as transporter_id,
              null::uuid as vehicle_id,
              rp.unique_id as passport_id,
              rp.qr_code,
              cu.full_name as client,
              pj.name as project,
              pr.address,
              pr.residue_type::text as residue,
              pr.volume_size::text as volume,
              pr.status,
              null::text as transporter,
              null::text as vehicle,
              null::text as vehicle_latitude,
              null::text as vehicle_longitude,
              pl.name as plant,
              coalesce(wt.net_weight_kg, rp.final_weight_kg)::text as net_weight_kg,
              pr.price_cents,
              count(distinct ph.id)::text as evidence_count,
              c.public_url as certificate_url,
              pr.created_at::text,
              pr.scheduled_at::text,
              pj.latitude::text as project_latitude,
              pj.longitude::text as project_longitude,
              pl.latitude::text as plant_latitude,
              pl.longitude::text as plant_longitude,
              coalesce(
                jsonb_agg(distinct jsonb_build_object('id', te.id, 'event', te.event_name, 'status', te.status, 'createdAt', te.created_at, 'actor', eu.full_name, 'role', te.user_role, 'latitude', te.latitude::text, 'longitude', te.longitude::text)) filter (where te.id is not null),
                '[]'::jsonb
              ) as timeline,
              coalesce(
                jsonb_agg(distinct jsonb_build_object('id', ph.id, 'kind', ph.kind, 'path', ph.storage_path, 'createdAt', ph.created_at)) filter (where ph.id is not null),
                '[]'::jsonb
              ) as photos
            from pickup_requests pr
            join users cu on cu.id = pr.client_id
            join projects pj on pj.id = pr.project_id
            left join plants pl on pl.id = pr.plant_id
            left join residue_passports rp on rp.pickup_request_id = pr.id
            left join photos ph on ph.pickup_request_id = pr.id
            left join certificates c on c.pickup_request_id = pr.id
            left join weight_tickets wt on wt.pickup_request_id = pr.id and wt.approved_at is not null
            left join tracking_events te on te.pickup_request_id = pr.id
            left join users eu on eu.id = te.user_id
            left join transport_assignments ta on ta.pickup_request_id = pr.id
            where pr.status = 'pendiente' and ta.id is null
            group by pr.id, pr.plant_id, rp.unique_id, rp.qr_code, cu.full_name, pj.name, pj.latitude, pj.longitude, pl.name, pl.latitude, pl.longitude, wt.net_weight_kg, rp.final_weight_kg, c.public_url
            order by pr.created_at desc
            limit 25`,
          )
        ).rows.map(mapDashboardService)
      : [];

  const plants = (await query<{ id: string; name: string }>("select id, name from plants where active = true order by name")).rows;
  const transporters = (await query<{ id: string; label: string; meta: string | null }>("select id, coalesce(company_name, full_name) as label, email as meta from users where role = 'transportador' order by label")).rows;
  const vehicles =
    user.role === "transportador"
      ? (
          await query<VehicleOptionRow>(
            `select
              v.id,
              v.plate || ' - ' || v.vehicle_type as label,
              v.capacity_tons::text || ' t' as meta,
              photo.photo_path,
              d.full_name as driver_name,
              d.phone as driver_phone,
              d.identification as driver_identification,
              d.license_number,
              case when c.id is not null then 'Tratamiento aceptado' else 'Sin consentimiento' end as consent_status
            from vehicles v
            left join lateral (
              select item->>'path' as photo_path
              from jsonb_array_elements(v.documents) item
              where item->>'type' = 'vehicle_photo'
              order by coalesce(item->>'uploaded_at', '') desc
              limit 1
            ) photo on true
            left join lateral (
              select full_name, phone, identification, license_number
              from drivers
              where transporter_id = v.transporter_id and active = true
              order by id desc
              limit 1
            ) d on true
            left join lateral (
              select id
              from data_processing_consents
              where user_id = v.transporter_id
              order by accepted_at desc
              limit 1
            ) c on true
            where v.active = true and v.transporter_id = $1
            order by v.plate`,
            [user.id],
          )
        ).rows.map((row) => mapVehicleOption(row, true))
      : (
          await query<VehicleOptionRow>(
            `select
              v.id,
              v.plate || ' - ' || v.vehicle_type as label,
              v.capacity_tons::text || ' t' as meta,
              photo.photo_path,
              d.full_name as driver_name,
              d.phone as driver_phone,
              d.identification as driver_identification,
              d.license_number,
              case when c.id is not null then 'Tratamiento aceptado' else 'Sin consentimiento' end as consent_status
            from vehicles v
            left join lateral (
              select item->>'path' as photo_path
              from jsonb_array_elements(v.documents) item
              where item->>'type' = 'vehicle_photo'
              order by coalesce(item->>'uploaded_at', '') desc
              limit 1
            ) photo on true
            left join lateral (
              select full_name, phone, identification, license_number
              from drivers
              where transporter_id = v.transporter_id and active = true
              order by id desc
              limit 1
            ) d on true
            left join lateral (
              select id
              from data_processing_consents
              where user_id = v.transporter_id
              order by accepted_at desc
              limit 1
            ) c on true
            where v.active = true
            order by v.plate`,
          )
        ).rows.map((row) => mapVehicleOption(row, false));
  const projects =
    role === "cliente" || user.role === "cliente"
      ? (await query<{ id: string; name: string; address: string }>("select id, name, address from projects where client_id = $1 order by created_at desc", [user.id])).rows
      : [];
  const analytics =
    user.role === "admin"
      ? (await query<{ services: number; collected_kg: number; revenue_cents: number }>("select services, collected_kg, revenue_cents from analytics")).rows[0]
      : null;
  const stats = (await query<DashboardStats>(
    `select
      count(*)::int as services,
      count(*) filter (where status not in ('finalizado', 'certificado generado'))::int as active,
      count(*) filter (where status = 'pendiente')::int as pending,
      count(*) filter (where status = 'en transito')::int as "inTransit",
      coalesce(sum(wt.net_weight_kg) filter (where wt.approved_at::date = current_date), 0)::float / 1000 as "tonsToday",
      coalesce(sum(pr.price_cents) filter (where pr.created_at::date = current_date), 0)::int as "revenueToday",
      count(c.id) filter (where c.generated_at::date = current_date)::int as "certificatesToday"
    from pickup_requests pr
    left join weight_tickets wt on wt.pickup_request_id = pr.id
    left join certificates c on c.pickup_request_id = pr.id
    where ${visibility.sql}`,
    visibility.params,
  )).rows[0] ?? { services: 0, active: 0, pending: 0, inTransit: 0, tonsToday: 0, revenueToday: 0, certificatesToday: 0 };

  let controlTower: ControlTowerData = { alerts: [], sla: [], suggestions: [], analytics: [] };
  if (user.role === "admin") {
    try {
      const [alerts, sla, suggestions, operationsAnalytics] = await Promise.all([
        query<ControlTowerData["alerts"][number]>(
          `select id, type, severity, message, created_at::text
           from operational_alerts
           where status <> 'resolved'
           order by case severity when 'critical' then 1 when 'warning' then 2 else 3 end, created_at desc
           limit 12`,
        ),
        query<ControlTowerData["sla"][number]>(
          `select pickup_request_id, sla_status, request_to_assignment_minutes::text, total_service_duration_minutes::text, updated_at::text
           from sla_metrics
           order by updated_at desc
           limit 12`,
        ),
        query<ControlTowerData["suggestions"][number]>(
          `select ds.id, ds.pickup_request_id, coalesce(tu.company_name, tu.full_name) as transporter, v.plate, p.name as plant,
                  ds.transporter_score::text, ds.plant_score::text, ds.eta_minutes, ds.distance_km::text, ds.created_at::text
           from dispatch_suggestions ds
           left join users tu on tu.id = ds.transporter_id
           left join vehicles v on v.id = ds.vehicle_id
           left join plants p on p.id = ds.plant_id
           order by ds.created_at desc
           limit 12`,
        ),
        query<ControlTowerData["analytics"][number]>("select city, residue_type, services, kg_collected::text, avg_service_minutes::text, active_services from operations_analytics order by services desc limit 12"),
      ]);
      controlTower = {
        alerts: alerts.rows,
        sla: sla.rows,
        suggestions: suggestions.rows,
        analytics: operationsAnalytics.rows,
      };
    } catch {
      // Phase 6 tables may not be migrated yet in a local developer database.
      controlTower = { alerts: [], sla: [], suggestions: [], analytics: [] };
    }
  }

  return { services, availableServices, plants, projects, transporters, vehicles, analytics, stats, controlTower };
}
