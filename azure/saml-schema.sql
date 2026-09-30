-- Vínculos explícitos: nunca concede acesso por coincidência de e-mail ou grupo.
create table if not exists public.app_saml_identities (
  tenant_id uuid not null,
  object_id uuid not null,
  user_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tenant_id, object_id),
  unique (tenant_id, user_id)
);
create table if not exists public.app_saml_flows (
  state_hash text primary key,
  browser_hash text not null,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create table if not exists public.app_saml_requests (
  id text primary key,
  flow_hash text not null,
  value text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create index if not exists app_saml_flows_expiry_idx on public.app_saml_flows (expires_at);
create index if not exists app_saml_requests_expiry_idx on public.app_saml_requests (expires_at);
