-- Ejecutar en Neon o en la base existente antes del primer deploy Vercel.
-- Habilita storage temporal en PostgreSQL para uploads/PDFs en entorno serverless.

create table if not exists file_objects (
  key text primary key,
  content_type text not null,
  data_base64 text not null,
  size_bytes integer not null check (size_bytes >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_file_objects_created_at on file_objects(created_at desc);
