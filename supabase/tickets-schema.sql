create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  case_number text,
  status text not null default 'Novo',
  reason text,
  opened_at timestamptz not null,
  updated_at timestamptz,
  closed_at timestamptz,
  priority text,
  requester text,
  requester_organization text,
  assigned_agent text,
  assigned_to text,
  assigned_group text,
  ticket_type text,
  sla_status text,
  beneficiary_organization text,
  requested_for text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at_system timestamptz not null default now()
);

-- Remove a coluna de instalações criadas com versões anteriores do painel.
alter table public.tickets
drop column if exists summary;

create index if not exists tickets_opened_at_idx on public.tickets (opened_at desc);
create index if not exists tickets_status_idx on public.tickets (status);
drop index if exists tickets_case_number_unique;
alter table public.tickets
drop constraint if exists tickets_case_number_key;

alter table public.tickets
add constraint tickets_case_number_key unique (case_number);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at_system = now();
  return new;
end;
$$;

drop trigger if exists tickets_set_updated_at on public.tickets;
create trigger tickets_set_updated_at
before update on public.tickets
for each row
execute function public.set_updated_at();

alter table public.tickets enable row level security;

drop policy if exists "tickets_authenticated_select" on public.tickets;
create policy "tickets_authenticated_select"
on public.tickets
for select
to authenticated
using (true);
