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

insert into user_roles (user_id, role_id)
select id, role::text from users
on conflict do nothing;
