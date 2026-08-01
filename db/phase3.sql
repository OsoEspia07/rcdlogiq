alter type service_status add value if not exists 'aceptado';
alter type service_status add value if not exists 'cargado';
alter type service_status add value if not exists 'recibido en planta';
alter type service_status add value if not exists 'pesado';
alter type service_status add value if not exists 'procesado';
alter type service_status add value if not exists 'certificado generado';

alter table tracking_events add column if not exists user_role user_role;
alter table transport_assignments add column if not exists status text not null default 'asignado';
alter table projects add column if not exists latitude numeric(10,7);
alter table projects add column if not exists longitude numeric(10,7);
alter table plants add column if not exists latitude numeric(10,7);
alter table plants add column if not exists longitude numeric(10,7);

update tracking_events te
set user_role = u.role
from users u
where te.user_id = u.id and te.user_role is null;

update projects
set latitude = coalesce(latitude, 4.7109886),
    longitude = coalesce(longitude, -74.072092)
where latitude is null or longitude is null;

update plants
set latitude = coalesce(latitude, 4.678801),
    longitude = coalesce(longitude, -74.143932)
where latitude is null or longitude is null;

create index if not exists idx_assignments_transporter on transport_assignments(transporter_id);
create index if not exists idx_assignments_pickup on transport_assignments(pickup_request_id);
create index if not exists idx_weight_tickets_pickup on weight_tickets(pickup_request_id);
