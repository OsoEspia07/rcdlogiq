create extension if not exists pgcrypto;

do $$ begin
  create type user_role as enum ('cliente', 'transportador', 'planta', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type residue_type as enum ('concreto', 'ladrillo', 'mixto', 'madera', 'drywall', 'metal', 'otros');
exception when duplicate_object then null; end $$;

do $$ begin
  create type volume_size as enum ('pequeno', 'mediano', 'grande');
exception when duplicate_object then null; end $$;

do $$ begin
  create type service_status as enum ('pendiente', 'asignado', 'aceptado', 'en camino', 'cargando', 'cargado', 'en transito', 'recibido en planta', 'pesado', 'procesado', 'certificado generado', 'finalizado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type photo_kind as enum ('residuo', 'antes', 'despues', 'cargue', 'bascula', 'manifiesto', 'certificado');
exception when duplicate_object then null; end $$;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  role user_role not null default 'cliente',
  full_name text not null,
  phone text,
  company_name text,
  document_id text,
  created_at timestamptz not null default now()
);

create table if not exists roles (
  id text primary key,
  name text not null,
  description text not null default ''
);

create table if not exists permissions (
  id text primary key,
  description text not null default ''
);

create table if not exists role_permissions (
  role_id text not null references roles(id) on delete cascade,
  permission_id text not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists user_roles (
  user_id uuid not null references users(id) on delete cascade,
  role_id text not null references roles(id) on delete cascade,
  primary key (user_id, role_id)
);

create table if not exists app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references users(id) on delete cascade,
  name text not null,
  address text not null,
  city text not null default 'Bogota',
  latitude numeric(10,7),
  longitude numeric(10,7),
  created_at timestamptz not null default now()
);

create table if not exists plants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references users(id) on delete set null,
  name text not null,
  authorization_code text not null unique,
  address text not null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  transporter_id uuid not null references users(id) on delete cascade,
  plate text not null unique,
  capacity_tons numeric(10,2) not null check (capacity_tons > 0),
  vehicle_type text not null,
  documents jsonb not null default '[]'::jsonb,
  active boolean not null default true
);

create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  transporter_id uuid not null references users(id) on delete cascade,
  full_name text not null,
  identification text not null,
  license_number text not null,
  phone text,
  active boolean not null default true
);

create table if not exists data_processing_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  version text not null,
  source text not null,
  consent_text text not null,
  accepted_at timestamptz not null default now(),
  ip text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists pickup_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  plant_id uuid references plants(id) on delete set null,
  residue_type residue_type not null,
  volume_size volume_size not null,
  scheduled_at timestamptz not null,
  status service_status not null default 'pendiente',
  address text not null,
  price_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists residue_passports (
  id uuid primary key default gen_random_uuid(),
  pickup_request_id uuid not null unique references pickup_requests(id) on delete cascade,
  unique_id text not null unique,
  qr_code text not null unique,
  timestamps jsonb not null default '{}'::jsonb,
  geo_locations jsonb not null default '[]'::jsonb,
  final_weight_kg numeric(12,2),
  certificate_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists transport_assignments (
  id uuid primary key default gen_random_uuid(),
  pickup_request_id uuid not null unique references pickup_requests(id) on delete cascade,
  transporter_id uuid not null references users(id),
  vehicle_id uuid references vehicles(id),
  driver_id uuid references drivers(id),
  status text not null default 'asignado',
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists weight_tickets (
  id uuid primary key default gen_random_uuid(),
  pickup_request_id uuid not null references pickup_requests(id) on delete cascade,
  plant_id uuid not null references plants(id),
  gross_weight_kg numeric(12,2) not null check (gross_weight_kg >= 0),
  tare_weight_kg numeric(12,2) not null check (tare_weight_kg >= 0),
  net_weight_kg numeric(12,2) generated always as (gross_weight_kg - tare_weight_kg) stored,
  material_classification residue_type not null,
  disposition text not null,
  approved_by uuid references users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint positive_net_weight check (gross_weight_kg > tare_weight_kg)
);

create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  pickup_request_id uuid not null unique references pickup_requests(id) on delete cascade,
  storage_path text not null,
  public_url text,
  verification_hash text not null unique,
  generated_at timestamptz not null default now()
);

alter table residue_passports
  drop constraint if exists residue_passports_certificate_fk;
alter table residue_passports
  add constraint residue_passports_certificate_fk foreign key (certificate_id) references certificates(id);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  pickup_request_id uuid not null references pickup_requests(id) on delete cascade,
  uploaded_by uuid not null references users(id),
  kind photo_kind not null,
  storage_path text not null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  taken_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists file_objects (
  key text primary key,
  content_type text not null,
  data_base64 text not null,
  size_bytes integer not null check (size_bytes >= 0),
  created_at timestamptz not null default now()
);

create table if not exists tracking_events (
  id uuid primary key default gen_random_uuid(),
  pickup_request_id uuid not null references pickup_requests(id) on delete cascade,
  user_id uuid not null references users(id),
  event_name text not null,
  status service_status,
  user_role user_role,
  latitude numeric(10,7),
  longitude numeric(10,7),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists security_logs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  severity text not null default 'info',
  user_id uuid references users(id) on delete set null,
  user_role user_role,
  ip text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  pickup_request_id uuid not null references pickup_requests(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'pending',
  provider text,
  provider_reference text,
  created_at timestamptz not null default now()
);

create or replace view analytics as
select
  count(pr.id)::integer as services,
  coalesce(sum(wt.net_weight_kg), 0)::numeric as collected_kg,
  coalesce(sum(pr.price_cents), 0)::integer as revenue_cents,
  count(distinct pr.client_id)::integer as recurring_clients,
  avg(extract(epoch from (wt.approved_at - pr.created_at)) / 3600)::numeric(10,2) as avg_collection_hours
from pickup_requests pr
left join weight_tickets wt on wt.pickup_request_id = pr.id;

create index if not exists idx_sessions_token_hash on app_sessions(token_hash);
create index if not exists idx_pickups_client on pickup_requests(client_id);
create index if not exists idx_pickups_status on pickup_requests(status);
create index if not exists idx_tracking_pickup on tracking_events(pickup_request_id, created_at);
create index if not exists idx_photos_pickup on photos(pickup_request_id);
create index if not exists idx_file_objects_created_at on file_objects(created_at desc);
create index if not exists idx_security_logs_type_created_at on security_logs(type, created_at desc);

insert into roles (id, name, description) values
  ('cliente', 'Cliente', 'Generador de residuos RCD'),
  ('transportador', 'Transportador', 'Aliado logistico y operador de viaje'),
  ('planta', 'Planta RCD', 'Recepcion, bascula y procesamiento'),
  ('admin', 'Administrador', 'Torre de control operacional')
on conflict (id) do update set name = excluded.name, description = excluded.description;

insert into permissions (id, description) values
  ('pickup.create', 'Crear solicitudes de recoleccion'),
  ('pickup.read.own', 'Leer solicitudes propias o asignadas'),
  ('pickup.read.all', 'Leer todas las solicitudes'),
  ('pickup.assign', 'Asignar transportador, vehiculo y planta'),
  ('pickup.cancel.own', 'Cancelar solicitud propia pendiente'),
  ('tracking.read', 'Leer timeline operativo'),
  ('tracking.update', 'Actualizar tracking operativo'),
  ('evidence.upload', 'Subir evidencias'),
  ('weight.register', 'Registrar peso y aprobar recepcion'),
  ('certificate.read', 'Leer certificados permitidos'),
  ('certificate.generate', 'Generar certificados'),
  ('admin.audit.read', 'Leer auditoria operacional')
on conflict (id) do update set description = excluded.description;

insert into role_permissions (role_id, permission_id) values
  ('cliente', 'pickup.create'),
  ('cliente', 'pickup.read.own'),
  ('cliente', 'pickup.cancel.own'),
  ('cliente', 'tracking.read'),
  ('cliente', 'evidence.upload'),
  ('cliente', 'certificate.read'),
  ('transportador', 'pickup.read.own'),
  ('transportador', 'tracking.read'),
  ('transportador', 'tracking.update'),
  ('transportador', 'evidence.upload'),
  ('transportador', 'certificate.read'),
  ('planta', 'pickup.read.own'),
  ('planta', 'tracking.read'),
  ('planta', 'tracking.update'),
  ('planta', 'evidence.upload'),
  ('planta', 'weight.register'),
  ('planta', 'certificate.generate'),
  ('planta', 'certificate.read'),
  ('admin', 'pickup.create'),
  ('admin', 'pickup.read.all'),
  ('admin', 'pickup.assign'),
  ('admin', 'tracking.read'),
  ('admin', 'tracking.update'),
  ('admin', 'evidence.upload'),
  ('admin', 'weight.register'),
  ('admin', 'certificate.generate'),
  ('admin', 'certificate.read'),
  ('admin', 'admin.audit.read')
on conflict do nothing;
