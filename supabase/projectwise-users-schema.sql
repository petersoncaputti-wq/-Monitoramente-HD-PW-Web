create table if not exists public.pw_user_imports (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check (source_kind in ('explorer', 'portal')),
  file_name text not null,
  file_hash text,
  rows_read integer not null default 0,
  rows_imported integer not null default 0,
  status text not null check (status in ('completed', 'failed')),
  error_message text,
  imported_at timestamptz not null default now(),
  imported_by uuid references auth.users(id) on delete set null
);

create table if not exists public.pw_explorer_users (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references public.pw_user_imports(id) on delete set null,
  nome text,
  email text,
  pw_id text,
  data_criacao text,
  descricao text,
  ultimo_acesso text,
  status text,
  status_acesso text,
  status_projectwise text,
  elegivel_exclusao text,
  motivo text,
  acao_executada text,
  resultado text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pw_portal_users (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references public.pw_user_imports(id) on delete set null,
  email text,
  communication_email text,
  first_name text,
  middle_name text,
  last_name text,
  profile_country text,
  language text,
  entitlement_country text,
  entitlement_groups text,
  cost_allocation_group text,
  user_management_groups text,
  roles text,
  global_fulfillment_contact text,
  fulfillment_contact_countries text,
  city text,
  company_name text,
  job_title text,
  locked text,
  profile_creation_date text,
  last_login_date text,
  mfa text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pw_explorer_users_set_updated_at on public.pw_explorer_users;
create trigger pw_explorer_users_set_updated_at
before update on public.pw_explorer_users
for each row
execute function public.set_updated_at();

drop trigger if exists pw_portal_users_set_updated_at on public.pw_portal_users;
create trigger pw_portal_users_set_updated_at
before update on public.pw_portal_users
for each row
execute function public.set_updated_at();

alter table public.pw_user_imports enable row level security;
alter table public.pw_explorer_users enable row level security;
alter table public.pw_portal_users enable row level security;

drop policy if exists "pw_user_imports_authenticated_select" on public.pw_user_imports;
create policy "pw_user_imports_authenticated_select"
on public.pw_user_imports
for select
to authenticated
using (true);

drop policy if exists "pw_explorer_users_authenticated_select" on public.pw_explorer_users;
create policy "pw_explorer_users_authenticated_select"
on public.pw_explorer_users
for select
to authenticated
using (true);

drop policy if exists "pw_portal_users_authenticated_select" on public.pw_portal_users;
create policy "pw_portal_users_authenticated_select"
on public.pw_portal_users
for select
to authenticated
using (true);
