-- Resultados agregados; não armazena o catálogo completo de ativos.
create table if not exists public.kartado_inventory_snapshots (
  cache_key text primary key,
  company_uuid uuid not null,
  kind text not null check (kind in ('resumo', 'cruzamento')),
  params jsonb not null,
  payload jsonb,
  saved_at timestamptz,
  last_used_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_token uuid,
  last_refresh_at timestamptz,
  created_at timestamptz not null default now(),
  refresh_requested boolean not null default false,
  last_error text,
  update_state text not null default 'ociosa' check (update_state in ('ociosa','em_andamento','falhou','incompleta'))
);
create index if not exists kartado_inventory_snapshots_due_idx
  on public.kartado_inventory_snapshots (next_attempt_at);
