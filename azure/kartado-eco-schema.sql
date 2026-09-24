create table if not exists public.kartado_eco_imports (
  id bigserial primary key,
  file_name text not null,
  imported_at timestamptz not null default now(),
  imported_by uuid not null,
  payload jsonb not null
);
