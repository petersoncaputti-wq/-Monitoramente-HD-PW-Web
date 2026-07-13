do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'user');
  end if;
end;
$$;

create table if not exists public.app_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    'user'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.app_profiles.full_name),
    updated_at = now();

  return new;
end;
$$;

create or replace function public.update_my_profile(p_full_name text)
returns public.app_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.app_profiles;
begin
  update public.app_profiles
  set
    full_name = nullif(trim(p_full_name), ''),
    updated_at = now()
  where id = auth.uid()
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'Perfil de acesso nao encontrado.';
  end if;

  return updated_profile;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_profiles_set_updated_at on public.app_profiles;
create trigger app_profiles_set_updated_at
before update on public.app_profiles
for each row
execute function public.set_updated_at();

alter table public.app_profiles enable row level security;

drop policy if exists "app_profiles_select_own_or_admin" on public.app_profiles;
create policy "app_profiles_select_own_or_admin"
on public.app_profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "app_profiles_update_admin" on public.app_profiles;
create policy "app_profiles_update_admin"
on public.app_profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "app_profiles_insert_admin" on public.app_profiles;
create policy "app_profiles_insert_admin"
on public.app_profiles
for insert
to authenticated
with check (public.is_admin());
