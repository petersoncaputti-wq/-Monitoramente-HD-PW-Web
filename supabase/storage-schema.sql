create table if not exists public.storage_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_hash text,
  rows_read integer not null default 0,
  rows_imported integer not null default 0,
  status text not null check (status in ('completed', 'failed')),
  error_message text,
  imported_at timestamptz not null default now()
);

create table if not exists public.storage_readings (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references public.storage_imports(id) on delete set null,
  reading_date date not null,
  reading_time time not null,
  observed_at timestamptz not null,
  computer text not null,
  unit text not null,
  total_gb numeric,
  used_gb numeric,
  free_gb numeric,
  percent_used numeric,
  percent_free numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists storage_readings_unique_reading
on public.storage_readings (observed_at, computer, unit);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists storage_readings_set_updated_at on public.storage_readings;
create trigger storage_readings_set_updated_at
before update on public.storage_readings
for each row
execute function public.set_updated_at();

alter table public.storage_imports enable row level security;
alter table public.storage_readings enable row level security;

drop policy if exists "storage_imports_public_select" on public.storage_imports;
drop policy if exists "storage_imports_authenticated_select" on public.storage_imports;
create policy "storage_imports_authenticated_select"
on public.storage_imports
for select
to authenticated
using (true);

drop policy if exists "storage_readings_public_select" on public.storage_readings;
drop policy if exists "storage_readings_authenticated_select" on public.storage_readings;
create policy "storage_readings_authenticated_select"
on public.storage_readings
for select
to authenticated
using (true);
