insert into plants (
  name,
  authorization_code,
  address,
  city,
  latitude,
  longitude,
  accepted_residue_types,
  daily_capacity_tons,
  operational_status,
  active
)
values (
  'Quarzium S.A.S',
  'QUARZIUM-SOACHA-001',
  'Cra. 13 #4B - 35, Soacha, Cundinamarca',
  'Soacha',
  4.5706991,
  -74.2396968,
  array['concreto','ladrillo','mixto','madera','drywall','metal','otros']::residue_type[],
  120,
  'operativa',
  true
)
on conflict (authorization_code) do update
set name = excluded.name,
    address = excluded.address,
    city = excluded.city,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    accepted_residue_types = excluded.accepted_residue_types,
    daily_capacity_tons = excluded.daily_capacity_tons,
    operational_status = excluded.operational_status,
    active = true;
