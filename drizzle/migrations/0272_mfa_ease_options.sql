create table public.mfa_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token_hash text not null unique,
  device_id text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index mfa_trusted_devices_user_idx on public.mfa_trusted_devices (user_id);

create table public.mfa_fallback_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  code_hash text not null,
  purpose text not null default 'step_up',
  attempts int not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  sent_to text
);
create index mfa_fallback_codes_user_idx on public.mfa_fallback_codes (user_id, created_at);

grant select, delete on public.mfa_trusted_devices to authenticated;
grant all on public.mfa_trusted_devices to service_role;
alter table public.mfa_trusted_devices enable row level security;
create policy "Users manage their own remembered devices"
  on public.mfa_trusted_devices for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant all on public.mfa_fallback_codes to service_role;
alter table public.mfa_fallback_codes enable row level security;
-- No policies and no authenticated grant: fallback codes are only ever read and
-- verified by server code holding the service role.