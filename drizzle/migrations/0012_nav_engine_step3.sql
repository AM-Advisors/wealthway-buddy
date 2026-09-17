-- Step 3: NAV calculation, review, approval and publication.
-- Additive only. Extends the existing nav_versions registry into a reproducible
-- NAV engine with policy, pre-NAV checks, append-only events and immutability.

alter type public.nav_status add value if not exists 'calculating';

-- ------------------------------------------------------------- nav_versions

alter table public.nav_versions add column if not exists frequency text not null default 'quarterly';
alter table public.nav_versions add column if not exists period_start date;
alter table public.nav_versions add column if not exists period_label text;
alter table public.nav_versions add column if not exists methodology_version text not null default 'nav-v1';
alter table public.nav_versions add column if not exists source_cutoff_at timestamptz;
alter table public.nav_versions add column if not exists receivables_cents bigint not null default 0;
alter table public.nav_versions add column if not exists accrued_income_cents bigint not null default 0;
alter table public.nav_versions add column if not exists other_assets_cents bigint not null default 0;
alter table public.nav_versions add column if not exists payables_cents bigint not null default 0;
alter table public.nav_versions add column if not exists tax_liabilities_cents bigint not null default 0;
alter table public.nav_versions add column if not exists other_liabilities_cents bigint not null default 0;
alter table public.nav_versions add column if not exists total_liabilities_cents bigint not null default 0;
alter table public.nav_versions add column if not exists net_asset_value_cents bigint not null default 0;
alter table public.nav_versions add column if not exists investment_income_cents bigint not null default 0;
alter table public.nav_versions add column if not exists fund_expenses_cents bigint not null default 0;
alter table public.nav_versions add column if not exists prior_nav_version_id uuid references public.nav_versions(id) on delete set null;
alter table public.nav_versions add column if not exists prior_nav_cents bigint not null default 0;
alter table public.nav_versions add column if not exists change_cents bigint not null default 0;
alter table public.nav_versions add column if not exists change_pct numeric;
alter table public.nav_versions add column if not exists bridge jsonb not null default '{}'::jsonb;
alter table public.nav_versions add column if not exists inputs_snapshot jsonb not null default '{}'::jsonb;
alter table public.nav_versions add column if not exists valuation_versions jsonb not null default '[]'::jsonb;
alter table public.nav_versions add column if not exists checks jsonb not null default '[]'::jsonb;
alter table public.nav_versions add column if not exists overrides jsonb not null default '[]'::jsonb;
alter table public.nav_versions add column if not exists unit_accounting boolean not null default false;
alter table public.nav_versions add column if not exists units_issued numeric;
alter table public.nav_versions add column if not exists units_redeemed numeric;
alter table public.nav_versions add column if not exists manager_acknowledged_by uuid;
alter table public.nav_versions add column if not exists manager_acknowledged_at timestamptz;
alter table public.nav_versions add column if not exists manager_challenge_note text;
alter table public.nav_versions add column if not exists manager_approved_by uuid;
alter table public.nav_versions add column if not exists manager_approved_at timestamptz;
alter table public.nav_versions add column if not exists superseded_by_id uuid references public.nav_versions(id) on delete set null;
alter table public.nav_versions add column if not exists revision_impact_cents bigint;
alter table public.nav_versions add column if not exists revision_impact_pct numeric;
alter table public.nav_versions add column if not exists capital_handoff jsonb not null default '{}'::jsonb;

-- Only one published NAV can be current for a book and date.
create unique index if not exists nav_versions_published_unique
  on public.nav_versions (book_id, as_of_date) where status = 'published';

create index if not exists nav_versions_offering_idx
  on public.nav_versions (offering_id, as_of_date desc);

-- A published NAV is evidence: its figures, snapshot and bridge never change.
create or replace function public.protect_published_nav_figures()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'published' then
    if new.net_asset_value_cents is distinct from old.net_asset_value_cents
       or new.gross_asset_value_cents is distinct from old.gross_asset_value_cents
       or new.total_liabilities_cents is distinct from old.total_liabilities_cents
       or new.inputs_snapshot is distinct from old.inputs_snapshot
       or new.valuation_versions is distinct from old.valuation_versions
       or new.bridge is distinct from old.bridge
       or new.as_of_date is distinct from old.as_of_date
       or new.version is distinct from old.version
       or new.approved_by is distinct from old.approved_by
       or new.published_by is distinct from old.published_by then
      raise exception 'A published NAV is immutable. Publish a revised version instead.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists nav_versions_figures_immutable on public.nav_versions;
create trigger nav_versions_figures_immutable
  before update on public.nav_versions
  for each row execute function public.protect_published_nav_figures();

-- ------------------------------------------------------------- nav policies

create table if not exists public.nav_policies (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.ledger_books(id) on delete cascade,
  offering_id uuid references public.offerings(id) on delete cascade,
  frequency text not null default 'quarterly',
  unit_accounting boolean not null default false,
  unreconciled_cash_tolerance_cents bigint not null default 100000,
  unposted_journal_tolerance_cents bigint not null default 100000,
  open_item_tolerance_cents bigint not null default 100000,
  valuation_staleness_days integer not null default 120,
  blocking_checks jsonb not null default '[]'::jsonb,
  manager_workflow text not null default 'acknowledge',
  manager_approval_required boolean not null default false,
  methodology_version text not null default 'nav-v1',
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists nav_policies_offering_active
  on public.nav_policies (offering_id) where is_active;

grant select on public.nav_policies to authenticated;
grant all on public.nav_policies to service_role;
alter table public.nav_policies enable row level security;

create policy "staff read nav policies" on public.nav_policies
  for select to authenticated using (public.is_any_staff());
create policy "managers read their nav policies" on public.nav_policies
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));

-- ------------------------------------------------------------- nav checks

create table if not exists public.nav_checks (
  id uuid primary key default gen_random_uuid(),
  nav_version_id uuid not null references public.nav_versions(id) on delete cascade,
  offering_id uuid references public.offerings(id) on delete set null,
  code text not null,
  severity text not null default 'warning',
  detail text,
  context jsonb not null default '{}'::jsonb,
  overridable boolean not null default true,
  overridden_by uuid,
  overridden_at timestamptz,
  override_reason text,
  created_at timestamptz not null default now()
);
create index if not exists nav_checks_version_idx on public.nav_checks (nav_version_id);

grant select on public.nav_checks to authenticated;
grant all on public.nav_checks to service_role;
alter table public.nav_checks enable row level security;

create policy "staff read nav checks" on public.nav_checks
  for select to authenticated using (public.is_any_staff());
create policy "managers read their nav checks" on public.nav_checks
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));

-- ------------------------------------------------------------- nav events

create table if not exists public.nav_events (
  id uuid primary key default gen_random_uuid(),
  nav_version_id uuid references public.nav_versions(id) on delete cascade,
  offering_id uuid references public.offerings(id) on delete set null,
  actor_user_id uuid,
  actor_role text not null default 'unknown',
  action text not null,
  from_status text,
  to_status text,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists nav_events_version_idx on public.nav_events (nav_version_id, created_at desc);

grant select on public.nav_events to authenticated;
grant all on public.nav_events to service_role;
alter table public.nav_events enable row level security;

create policy "staff read nav events" on public.nav_events
  for select to authenticated using (public.is_any_staff());
create policy "managers read their nav events" on public.nav_events
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));

-- The NAV audit trail is append-only, including for the service role.
create or replace function public.protect_nav_events()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'NAV events are append-only.';
end;
$$;

drop trigger if exists nav_events_append_only on public.nav_events;
create trigger nav_events_append_only
  before update or delete on public.nav_events
  for each row execute function public.protect_nav_events();
