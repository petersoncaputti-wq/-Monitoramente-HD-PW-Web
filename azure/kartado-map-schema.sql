-- Base do mapa de apontamentos: cópia local, só com os campos que o mapa usa,
-- recoletada inteira uma vez por dia (04:00 de Brasília) ou pelo botão "Atualizar mapa".

-- Estado da coleta de cada unidade. A lease impede duas instâncias de coletar a mesma unidade.
create table if not exists public.kartado_map_sync (
  company_uuid uuid primary key,
  company_name text,
  state text not null default 'ociosa' check (state in ('ociosa','em_andamento','falhou','incompleta')),
  next_run_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_token uuid,
  generation integer not null default 0,
  run_started_at timestamptz,
  pages_done integer not null default 0,
  pages_total integer not null default 0,
  records_total integer not null default 0,
  last_success_at timestamptz,
  last_error text,
  manual_requested_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists kartado_map_sync_due_idx on public.kartado_map_sync (next_run_at);
-- A coleta anda em etapas: pages_failed acumula as falhas da coleta em curso e
-- requested_at põe à frente da fila a unidade que alguém está olhando ou pediu para atualizar.
alter table public.kartado_map_sync add column if not exists pages_failed integer not null default 0;
alter table public.kartado_map_sync add column if not exists requested_at timestamptz;

-- Um registro por apontamento. "generation" marca a coleta que o gravou: ao concluir
-- uma coleta completa, os registros de gerações anteriores (excluídos na origem) saem.
create table if not exists public.kartado_map_points (
  company_uuid uuid not null,
  uuid uuid not null,
  generation integer not null,
  numero text,
  rodovia text,
  km double precision,
  found_at date,
  classe text not null,
  status text not null,
  status_group text not null check (status_group in ('completed','progress','pending','other')),
  lon double precision,
  lat double precision,
  primary key (company_uuid, uuid)
);
create index if not exists kartado_map_points_found_idx on public.kartado_map_points (company_uuid, found_at);
create index if not exists kartado_map_points_geo_idx on public.kartado_map_points (company_uuid, lat, lon);
