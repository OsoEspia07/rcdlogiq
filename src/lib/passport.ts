import type { ServiceStatus, UserRole } from "@/lib/database.types";
import { query } from "@/lib/postgres";
import { getCurrentUser } from "@/lib/session";

export type PassportDetail = {
  pickupId: string;
  passportUniqueId: string;
  qrCode: string;
  status: ServiceStatus;
  client: string;
  project: string;
  address: string;
  residue: string;
  volume: string;
  scheduledAt: string;
  transporter: string;
  vehicle: string;
  plant: string;
  plantAddress: string | null;
  projectLatitude: number | null;
  projectLongitude: number | null;
  plantLatitude: number | null;
  plantLongitude: number | null;
  netWeightKg: number | null;
  certificateUrl: string | null;
  verificationHash: string | null;
  events: Array<{
    id: string;
    event: string;
    status: ServiceStatus | null;
    createdAt: string;
    actor: string | null;
    role: UserRole | null;
    latitude: number | null;
    longitude: number | null;
  }>;
  photos: Array<{ id: string; kind: string; url: string; createdAt: string }>;
};

type PassportRow = {
  pickup_id: string;
  passport_unique_id: string;
  qr_code: string;
  status: ServiceStatus;
  client: string;
  project: string;
  address: string;
  residue: string;
  volume: string;
  scheduled_at: string;
  transporter: string | null;
  vehicle: string | null;
  plant: string | null;
  plant_address: string | null;
  project_latitude: string | null;
  project_longitude: string | null;
  plant_latitude: string | null;
  plant_longitude: string | null;
  net_weight_kg: string | null;
  certificate_url: string | null;
  verification_hash: string | null;
  events: Array<{ id: string; event: string; status: ServiceStatus | null; createdAt: string; actor: string | null; role: UserRole | null; latitude: string | null; longitude: string | null }> | null;
  photos: Array<{ id: string; kind: string; path: string; createdAt: string }> | null;
};

function fileUrl(storagePath: string | null) {
  if (!storagePath) return null;
  const normalized = storagePath.replaceAll("\\", "/").replace(/^\/+/, "");
  const withStoragePrefix = normalized.startsWith("storage/") ? normalized : `storage/${normalized}`;
  return `/api/files/${withStoragePrefix.split("/").map(encodeURIComponent).join("/")}`;
}

export async function getPassportDetail(id: string): Promise<PassportDetail | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const result = await query<PassportRow>(
    `select
      pr.id as pickup_id,
      rp.unique_id as passport_unique_id,
      rp.qr_code,
      pr.status,
      cu.full_name as client,
      pj.name as project,
      pr.address,
      pr.residue_type::text as residue,
      pr.volume_size::text as volume,
      pr.scheduled_at::text,
      coalesce(tu.company_name, tu.full_name) as transporter,
      v.plate as vehicle,
      pl.name as plant,
      pl.address as plant_address,
      pj.latitude::text as project_latitude,
      pj.longitude::text as project_longitude,
      pl.latitude::text as plant_latitude,
      pl.longitude::text as plant_longitude,
      coalesce(wt.net_weight_kg, rp.final_weight_kg)::text as net_weight_kg,
      c.public_url as certificate_url,
      c.verification_hash,
      coalesce(
        jsonb_agg(distinct jsonb_build_object('id', te.id, 'event', te.event_name, 'status', te.status, 'createdAt', te.created_at, 'actor', eu.full_name, 'role', te.user_role, 'latitude', te.latitude::text, 'longitude', te.longitude::text)) filter (where te.id is not null),
        '[]'::jsonb
      ) as events,
      coalesce(
        jsonb_agg(distinct jsonb_build_object('id', ph.id, 'kind', ph.kind, 'path', ph.storage_path, 'createdAt', ph.created_at)) filter (where ph.id is not null),
        '[]'::jsonb
      ) as photos
    from residue_passports rp
    join pickup_requests pr on pr.id = rp.pickup_request_id
    join users cu on cu.id = pr.client_id
    join projects pj on pj.id = pr.project_id
    left join plants pl on pl.id = pr.plant_id
    left join weight_tickets wt on wt.pickup_request_id = pr.id and wt.approved_at is not null
    left join transport_assignments ta on ta.pickup_request_id = pr.id
    left join users tu on tu.id = ta.transporter_id
    left join vehicles v on v.id = ta.vehicle_id
    left join certificates c on c.pickup_request_id = pr.id
    left join tracking_events te on te.pickup_request_id = pr.id
    left join users eu on eu.id = te.user_id
    left join photos ph on ph.pickup_request_id = pr.id
    where (rp.unique_id = $1 or pr.id::text = $1) and (
      $2 = 'admin' or pr.client_id = $3 or ta.transporter_id = $3 or pl.owner_id = $3
    )
    group by pr.id, rp.unique_id, rp.qr_code, cu.full_name, pj.name, pj.latitude, pj.longitude, tu.company_name, tu.full_name, v.plate, pl.name, pl.address, pl.latitude, pl.longitude, wt.net_weight_kg, rp.final_weight_kg, c.public_url, c.verification_hash
    limit 1`,
    [id, user.role, user.id],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    pickupId: row.pickup_id,
    passportUniqueId: row.passport_unique_id,
    qrCode: row.qr_code,
    status: row.status,
    client: row.client,
    project: row.project,
    address: row.address,
    residue: row.residue,
    volume: row.volume,
    scheduledAt: row.scheduled_at,
    transporter: row.transporter ?? "Transportador pendiente",
    vehicle: row.vehicle ?? "Vehiculo pendiente",
    plant: row.plant ?? "Destino pendiente",
    plantAddress: row.plant_address,
    projectLatitude: row.project_latitude ? Number(row.project_latitude) : null,
    projectLongitude: row.project_longitude ? Number(row.project_longitude) : null,
    plantLatitude: row.plant_latitude ? Number(row.plant_latitude) : null,
    plantLongitude: row.plant_longitude ? Number(row.plant_longitude) : null,
    netWeightKg: row.net_weight_kg ? Number(row.net_weight_kg) : null,
    certificateUrl: row.certificate_url,
    verificationHash: row.verification_hash,
    events: (row.events ?? [])
      .map((event) => ({ ...event, latitude: event.latitude ? Number(event.latitude) : null, longitude: event.longitude ? Number(event.longitude) : null }))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    photos: (row.photos ?? [])
      .map((photo) => ({ id: photo.id, kind: photo.kind, url: fileUrl(photo.path) ?? "#", createdAt: photo.createdAt }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  };
}
