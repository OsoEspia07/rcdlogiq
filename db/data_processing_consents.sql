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

create index if not exists idx_data_processing_consents_user on data_processing_consents(user_id, accepted_at desc);
