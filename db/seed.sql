insert into users (id, email, password_hash, role, full_name, phone, company_name, document_id)
values
  ('00000000-0000-0000-0000-000000000101', 'cliente@rcd.local', 'cliente_seed_salt:0d80d1b6fc27edd655d7f81e48cb65599a54ab0dff2cdbba3f064a9000ddea342b27577583502dda8137429258f930e5ccfb03bdb21f22ecd020a34acc39a804', 'cliente', 'Constructora Norte', '+57 300 111 1111', 'Constructora Norte SAS', '900111222'),
  ('00000000-0000-0000-0000-000000000201', 'transportador@rcd.local', 'transportador_seed_salt:6bd142555b374309cda087f56f1099e230041fb3cef0d1e0b42821bb2b863ba7d4a12e062579e0ca55adc4df11d8719b4e1c2f7383f058329ef6e19c14d2514e', 'transportador', 'Volquetas Andes', '+57 300 222 2222', 'Volquetas Andes SAS', '901333444'),
  ('00000000-0000-0000-0000-000000000301', 'planta@rcd.local', 'planta_seed_salt:4ac15a3f26dfe57262476048cad840682ff06fad7e04c0d74b1785dd08fe08caefeaa41cd382985824f10a9a243f210bc69e09e963d36111667cfaffc3ae60d6', 'planta', 'EcoRCD Fontibon', '+57 300 333 3333', 'EcoRCD Fontibon', 'RES-2026-001'),
  ('00000000-0000-0000-0000-000000000401', 'admin@rcd.local', 'admin_seed_salt:21d379f9c26c0967f08739d2db0c90cab88b70f49761b41a830bcfa0d68fa6e201bd565e3f00baab264f6a6ead6123df2f3e7c616c0339ba9c1ad77a580d96c5', 'admin', 'Operacion RCD', '+57 300 444 4444', 'RCD Passport', 'ADMIN')
on conflict (id) do nothing;

insert into user_roles (user_id, role_id)
select id, role::text from users
on conflict do nothing;

insert into projects (id, client_id, name, address, city)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'Torre Cedro 12', 'Cra 19 # 102-34', 'Bogota')
on conflict (id) do nothing;

insert into plants (id, owner_id, name, authorization_code, address, active)
values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000301', 'EcoRCD Fontibon', 'AMB-RCD-2026-001', 'Zona Industrial Fontibon', true)
on conflict (id) do nothing;

insert into vehicles (id, transporter_id, plate, capacity_tons, vehicle_type, documents)
values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', 'AXK482', 22.5, 'volqueta doble troque', '[{"type":"soat","status":"valid"}]')
on conflict (id) do nothing;

insert into pickup_requests (id, client_id, project_id, plant_id, residue_type, volume_size, scheduled_at, status, address, price_cents)
values ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'mixto', 'grande', now() + interval '2 hours', 'en transito', 'Cra 19 # 102-34, Bogota', 184000000)
on conflict (id) do nothing;

insert into residue_passports (pickup_request_id, unique_id, qr_code, timestamps, final_weight_kg)
values ('50000000-0000-0000-0000-000000000001', 'PAS-BOG-8FA31', 'http://localhost:3000/passport/PAS-BOG-8FA31', '{"created":"2026-05-14T14:00:00Z","picked_up":"2026-05-14T15:05:00Z"}', 18400)
on conflict (pickup_request_id) do nothing;

insert into transport_assignments (pickup_request_id, transporter_id, vehicle_id, accepted_at)
values ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '30000000-0000-0000-0000-000000000001', now() - interval '1 hour')
on conflict (pickup_request_id) do nothing;

insert into tracking_events (pickup_request_id, user_id, user_role, event_name, status, latitude, longitude)
values ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', 'transportador', 'salida hacia planta', 'en transito', 4.6812, -74.1051);
