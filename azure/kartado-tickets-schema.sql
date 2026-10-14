create table if not exists public.kartado_tickets (
  id uuid primary key,
  case_number text not null,
  unit_id text not null,
  unit_name text not null,
  subject text not null,
  description text not null default '',
  status text not null check (status in ('Novo','Em atendimento','Aguardando','Encerrado')),
  priority text not null check (priority in ('Baixa','Normal','Alta','Crítica')),
  requester text not null default '',
  responsible text not null default '',
  resolution text not null default '',
  opened_at timestamptz not null,
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  created_by uuid not null,
  updated_by uuid not null,
  check (closed_at is null or closed_at >= opened_at),
  unique (unit_id, case_number)
);
create index if not exists kartado_tickets_unit_date_idx on public.kartado_tickets (unit_id, opened_at desc);
