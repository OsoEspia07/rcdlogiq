do $$ begin
  create type alert_severity as enum ('info', 'warning', 'critical');
exception when duplicate_object then null; end $$;

do $$ begin
  create type alert_status as enum ('open', 'acknowledged', 'resolved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type incident_status as enum ('open', 'assigned', 'resolved');
exception when duplicate_object then null; end $$;

alter type service_status add value if not exists 'planta';
alter type service_status add value if not exists 'retrasado';

alter table plants add column if not exists city text not null default 'Bogota';
alter table plants add column if not exists accepted_residue_types residue_type[] not null default array['concreto','ladrillo','mixto','madera','drywall','metal','otros']::residue_type[];
alter table plants add column if not exists daily_capacity_tons numeric(10,2) not null default 120;
alter table plants add column if not exists current_load_tons numeric(10,2) not null default 0;
alter table plants add column if not exists operational_status text not null default 'operativa';

alter table vehicles add column if not exists city text not null default 'Bogota';
alter table vehicles add column if not exists current_latitude numeric(10,7);
alter table vehicles add column if not exists current_longitude numeric(10,7);
alter table vehicles add column if not exists available boolean not null default true;

create table if not exists vehicle_locations (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  lat numeric(10,7) not null,
  lng numeric(10,7) not null,
  speed numeric(10,2),
  heading numeric(10,2),
  timestamp timestamptz not null default now()
);

create table if not exists sla_metrics (
  id uuid primary key default gen_random_uuid(),
  pickup_request_id uuid not null unique references pickup_requests(id) on delete cascade,
  request_to_assignment_minutes numeric(10,2),
  assignment_to_arrival_minutes numeric(10,2),
  loading_duration_minutes numeric(10,2),
  transit_duration_minutes numeric(10,2),
  plant_processing_duration_minutes numeric(10,2),
  total_service_duration_minutes numeric(10,2),
  sla_status text not null default 'on_track',
  updated_at timestamptz not null default now()
);

create table if not exists operational_alerts (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  severity alert_severity not null default 'warning',
  related_entity text not null,
  related_entity_id uuid,
  status alert_status not null default 'open',
  message text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists transporter_scores (
  transporter_id uuid primary key references users(id) on delete cascade,
  punctuality_score numeric(5,2) not null default 80,
  sla_score numeric(5,2) not null default 80,
  cancellation_score numeric(5,2) not null default 90,
  evidence_score numeric(5,2) not null default 80,
  speed_score numeric(5,2) not null default 80,
  completed_trips integer not null default 0,
  cancelled_trips integer not null default 0,
  score numeric(5,2) not null default 82,
  updated_at timestamptz not null default now()
);

create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  pickup_request_id uuid references pickup_requests(id) on delete cascade,
  type text not null,
  severity alert_severity not null default 'warning',
  status incident_status not null default 'open',
  assigned_to uuid references users(id) on delete set null,
  description text not null,
  resolution text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists incident_comments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  comment text not null,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  role user_role,
  type text not null,
  title text not null,
  body text not null,
  related_entity text,
  related_entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists operational_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  pickup_request_id uuid references pickup_requests(id) on delete cascade,
  actor_id uuid references users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists dispatch_suggestions (
  id uuid primary key default gen_random_uuid(),
  pickup_request_id uuid not null references pickup_requests(id) on delete cascade,
  transporter_id uuid references users(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,
  plant_id uuid references plants(id) on delete set null,
  transporter_score numeric(8,2),
  plant_score numeric(8,2),
  eta_minutes integer,
  distance_km numeric(10,2),
  reason jsonb not null default '{}'::jsonb,
  status text not null default 'suggested',
  created_at timestamptz not null default now()
);

create or replace view operations_analytics as
select
  coalesce(pj.city, 'Sin ciudad') as city,
  pr.residue_type::text as residue_type,
  count(pr.id)::int as services,
  coalesce(sum(wt.net_weight_kg), 0)::numeric(12,2) as kg_collected,
  avg(sm.total_service_duration_minutes)::numeric(10,2) as avg_service_minutes,
  count(*) filter (where pr.status not in ('finalizado', 'certificado generado'))::int as active_services
from pickup_requests pr
join projects pj on pj.id = pr.project_id
left join weight_tickets wt on wt.pickup_request_id = pr.id
left join sla_metrics sm on sm.pickup_request_id = pr.id
group by pj.city, pr.residue_type;

create index if not exists idx_vehicle_locations_vehicle_time on vehicle_locations(vehicle_id, timestamp desc);
create index if not exists idx_alerts_status_created on operational_alerts(status, created_at desc);
create index if not exists idx_incidents_status_created on incidents(status, created_at desc);
create index if not exists idx_notifications_user_created on notifications(user_id, created_at desc);
create index if not exists idx_operational_events_pickup_created on operational_events(pickup_request_id, created_at desc);
create index if not exists idx_dispatch_suggestions_pickup_created on dispatch_suggestions(pickup_request_id, created_at desc);
create index if not exists idx_pickups_scheduled_status on pickup_requests(status, scheduled_at);
