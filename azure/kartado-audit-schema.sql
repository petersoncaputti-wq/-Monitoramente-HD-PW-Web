-- Consultas assíncronas da aba Apontamentos. Não altera dados do Kartado.
create table if not exists public.kartado_audit_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  params jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  result jsonb,
  error text,
  retry_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null default now() + interval '1 hour'
);
alter table public.kartado_audit_jobs add column if not exists retry_at timestamptz;
create index if not exists kartado_audit_jobs_queue_idx on public.kartado_audit_jobs (status, created_at);
create index if not exists kartado_audit_jobs_owner_idx on public.kartado_audit_jobs (user_id, expires_at);
create unique index if not exists kartado_audit_jobs_active_user_idx
  on public.kartado_audit_jobs (user_id) where status in ('queued', 'running');
