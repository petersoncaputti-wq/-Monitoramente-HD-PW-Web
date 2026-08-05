create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('admin', 'user');
  end if;
end;
$$;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  full_name text,
  role app_role not null default 'user',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_sessions (
  token_hash text primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists app_sessions_user_id_idx on app_sessions(user_id);
create index if not exists app_sessions_expires_at_idx on app_sessions(expires_at);

create table if not exists storage_imports (
  id uuid primary key default gen_random_uuid(), file_name text not null, file_hash text,
  rows_read integer not null default 0, rows_imported integer not null default 0,
  status text not null check (status in ('completed', 'failed')), error_message text,
  imported_at timestamptz not null default now()
);

create table if not exists storage_readings (
  id uuid primary key default gen_random_uuid(), import_id uuid references storage_imports(id) on delete set null,
  reading_date date not null, reading_time time not null, observed_at timestamptz not null,
  computer text not null, unit text not null, total_gb numeric, used_gb numeric, free_gb numeric,
  percent_used numeric, percent_free numeric, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(observed_at, computer, unit)
);

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(), case_number text unique, status text not null default 'Novo',
  reason text, opened_at timestamptz not null, updated_at timestamptz, closed_at timestamptz,
  priority text, requester text, requester_organization text, assigned_agent text, assigned_to text,
  assigned_group text, ticket_type text, sla_status text, beneficiary_organization text,
  requested_for text, created_by uuid references app_users(id) on delete set null,
  updated_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at_system timestamptz not null default now()
);

create table if not exists pw_user_imports (
  id uuid primary key default gen_random_uuid(), source_kind text not null check (source_kind in ('explorer', 'portal')),
  file_name text not null, file_hash text, rows_read integer not null default 0,
  rows_imported integer not null default 0, status text not null check (status in ('completed', 'failed')),
  error_message text, imported_at timestamptz not null default now(),
  imported_by uuid references app_users(id) on delete set null
);

create table if not exists pw_explorer_users (
  id uuid primary key default gen_random_uuid(), import_id uuid references pw_user_imports(id) on delete set null,
  nome text, email text, pw_id text, data_criacao text, descricao text, ultimo_acesso text,
  status text, status_acesso text, status_projectwise text, elegivel_exclusao text, motivo text,
  acao_executada text, resultado text, raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists pw_portal_users (
  id uuid primary key default gen_random_uuid(), import_id uuid references pw_user_imports(id) on delete set null,
  email text, communication_email text, first_name text, middle_name text, last_name text,
  profile_country text, language text, entitlement_country text, entitlement_groups text,
  cost_allocation_group text, user_management_groups text, roles text, global_fulfillment_contact text,
  fulfillment_contact_countries text, city text, company_name text, job_title text, locked text,
  profile_creation_date text, last_login_date text, mfa text, raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table tickets drop constraint if exists tickets_created_by_fkey;
alter table tickets drop constraint if exists tickets_updated_by_fkey;
alter table tickets add constraint tickets_created_by_fkey foreign key (created_by) references app_users(id) on delete set null not valid;
alter table tickets add constraint tickets_updated_by_fkey foreign key (updated_by) references app_users(id) on delete set null not valid;

alter table pw_user_imports drop constraint if exists pw_user_imports_imported_by_fkey;
alter table pw_user_imports add constraint pw_user_imports_imported_by_fkey foreign key (imported_by) references app_users(id) on delete set null not valid;

create index if not exists tickets_opened_at_idx on tickets(opened_at desc);
create index if not exists tickets_status_idx on tickets(status);
