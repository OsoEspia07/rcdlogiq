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

create index if not exists idx_security_logs_type_created_at on security_logs(type, created_at desc);
