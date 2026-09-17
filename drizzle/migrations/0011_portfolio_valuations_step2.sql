-- Step 2: portfolio assets, versioned valuations, evidence, governance.
create type public.portfolio_asset_class as enum (
  'private_common', 'private_preferred', 'safe', 'convertible_note', 'debt',
  'fund_interest', 'spv_interest', 'real_estate', 'digital_security',
  'cash_equivalent', 'other'
);

create type public.portfolio_asset_status as enum (
  'active', 'partially_realized', 'realized', 'written_off'
);

create type public.valuation_method as enum (
  'recent_financing', 'transaction_price', 'secondary_transaction',
  'market_comparable', 'public_market', 'dcf', 'income_approach', 'cost',
  'adjusted_cost', 'appraisal', 'manager_mark', 'third_party', 'other'
);

create type public.valuation_source_type as enum (
  'independent_third_party', 'observable_transaction', 'recent_financing',
  'public_market', 'manager_mark', 'internal_model', 'other'
);

create type public.portfolio_valuation_status as enum (
  'draft', 'review', 'returned', 'rejected', 'approved', 'effective', 'superseded'
);

create type public.valuation_evidence_kind as enum (
  'cap_table', 'financing_document', 'purchase_agreement', 'board_materials',
  'third_party_appraisal', 'brokerage_statement', 'market_price_evidence',
  'waterfall_capitalization', 'portfolio_company_financials', 'other'
);

alter type public.accounting_exception_kind add value if not exists 'stale_valuation';
alter type public.accounting_exception_kind add value if not exists 'missing_valuation_source';
alter type public.accounting_exception_kind add value if not exists 'missing_valuation_methodology';
alter type public.accounting_exception_kind add value if not exists 'unsupported_valuation_change';
alter type public.accounting_exception_kind add value if not exists 'valuation_change_threshold';
alter type public.accounting_exception_kind add value if not exists 'missing_quantity';
alter type public.accounting_exception_kind add value if not exists 'missing_cost_basis';
alter type public.accounting_exception_kind add value if not exists 'impossible_valuation';
alter type public.accounting_exception_kind add value if not exists 'conflicting_valuation_sources';
alter type public.accounting_exception_kind add value if not exists 'missing_valuation_evidence';

create table public.portfolio_assets (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.ledger_books(id) on delete cascade,
  offering_id uuid references public.offerings(id) on delete set null,
  client_entity_id uuid references public.client_entities(id) on delete set null,
  issuer_name text not null,
  asset_name text not null,
  asset_class public.portfolio_asset_class not null default 'private_common',
  instrument text,
  ct_company_id uuid references public.ct_companies(id) on delete set null,
  ct_security_id uuid references public.ct_securities(id) on delete set null,
  external_reference text,
  quantity numeric,
  ownership_pct numeric,
  acquisition_date date,
  cost_basis_cents bigint not null default 0,
  currency text not null default 'USD',
  original_transaction_table text,
  original_transaction_id uuid,
  status public.portfolio_asset_status not null default 'active',
  realized_quantity numeric not null default 0,
  realized_cost_basis_cents bigint not null default 0,
  realized_proceeds_cents bigint not null default 0,
  realized_gain_cents bigint not null default 0,
  disposition_date date,
  disposition_note text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index portfolio_assets_book_idx on public.portfolio_assets (book_id, status);
create index portfolio_assets_offering_idx on public.portfolio_assets (offering_id);
create unique index portfolio_assets_security_unique
  on public.portfolio_assets (book_id, ct_security_id) where ct_security_id is not null;

grant select on public.portfolio_assets to authenticated;
grant all on public.portfolio_assets to service_role;
alter table public.portfolio_assets enable row level security;

create policy "staff read portfolio assets" on public.portfolio_assets
  for select to authenticated using (public.is_any_staff());
create policy "managers read their portfolio assets" on public.portfolio_assets
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));

create table public.portfolio_valuations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.portfolio_assets(id) on delete cascade,
  book_id uuid not null references public.ledger_books(id) on delete cascade,
  offering_id uuid references public.offerings(id) on delete set null,
  version integer not null default 1,
  status public.portfolio_valuation_status not null default 'draft',
  valuation_date date not null,
  effective_date date not null,
  value_cents bigint not null,
  price_per_unit_cents bigint,
  quantity numeric,
  cost_basis_cents bigint not null default 0,
  currency text not null default 'USD',
  methodology public.valuation_method not null,
  methodology_note text,
  source_type public.valuation_source_type not null,
  source text,
  source_date date,
  inputs jsonb not null default '{}'::jsonb,
  assumptions text,
  conflicts jsonb not null default '[]'::jsonb,
  prior_valuation_id uuid references public.portfolio_valuations(id) on delete set null,
  supersedes_id uuid references public.portfolio_valuations(id) on delete set null,
  superseded_by_id uuid references public.portfolio_valuations(id) on delete set null,
  change_cents bigint not null default 0,
  change_pct numeric,
  prepared_by uuid,
  prepared_by_role text,
  prepared_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  effective_at timestamptz,
  decision_reason text,
  manager_acknowledged_by uuid,
  manager_acknowledged_at timestamptz,
  manager_challenge_note text,
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_id, version)
);
create index portfolio_valuations_asset_idx
  on public.portfolio_valuations (asset_id, effective_date desc, version desc);
create index portfolio_valuations_status_idx on public.portfolio_valuations (status, offering_id);
create unique index portfolio_valuations_journal_unique
  on public.portfolio_valuations (journal_entry_id) where journal_entry_id is not null;
create unique index portfolio_valuations_effective_unique
  on public.portfolio_valuations (asset_id, effective_date) where status = 'effective';

grant select on public.portfolio_valuations to authenticated;
grant all on public.portfolio_valuations to service_role;
alter table public.portfolio_valuations enable row level security;

create policy "staff read valuations v2" on public.portfolio_valuations
  for select to authenticated using (public.is_any_staff());
create policy "managers read their valuations v2" on public.portfolio_valuations
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));

create or replace function public.protect_effective_valuation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('effective', 'superseded') then
      raise exception 'Effective valuations cannot be deleted; supersede them instead.';
    end if;
    return old;
  end if;

  if old.status in ('effective', 'superseded') then
    if new.value_cents is distinct from old.value_cents
       or new.price_per_unit_cents is distinct from old.price_per_unit_cents
       or new.quantity is distinct from old.quantity
       or new.cost_basis_cents is distinct from old.cost_basis_cents
       or new.methodology is distinct from old.methodology
       or new.source_type is distinct from old.source_type
       or new.source is distinct from old.source
       or new.source_date is distinct from old.source_date
       or new.inputs is distinct from old.inputs
       or new.valuation_date is distinct from old.valuation_date
       or new.effective_date is distinct from old.effective_date
       or new.version is distinct from old.version
       or new.asset_id is distinct from old.asset_id
       or new.approved_by is distinct from old.approved_by
       or new.prepared_by is distinct from old.prepared_by then
      raise exception 'Effective valuations are immutable; record a new version instead.';
    end if;
    if old.status = 'superseded' and new.status <> 'superseded' then
      raise exception 'A superseded valuation cannot be reactivated.';
    end if;
    if old.status = 'effective' and new.status not in ('effective', 'superseded') then
      raise exception 'An effective valuation can only be superseded.';
    end if;
    if old.journal_entry_id is not null
       and new.journal_entry_id is distinct from old.journal_entry_id then
      raise exception 'The journal behind a valuation cannot be swapped.';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger protect_effective_valuation
  before update or delete on public.portfolio_valuations
  for each row execute function public.protect_effective_valuation();

create table public.valuation_evidence (
  id uuid primary key default gen_random_uuid(),
  valuation_id uuid not null references public.portfolio_valuations(id) on delete cascade,
  asset_id uuid not null references public.portfolio_assets(id) on delete cascade,
  offering_id uuid references public.offerings(id) on delete set null,
  kind public.valuation_evidence_kind not null default 'other',
  title text not null,
  storage_bucket text not null default 'valuation-evidence',
  storage_path text,
  content_hash text,
  structured jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  supersedes_id uuid references public.valuation_evidence(id) on delete set null,
  uploaded_by uuid,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index valuation_evidence_valuation_idx on public.valuation_evidence (valuation_id);

grant select on public.valuation_evidence to authenticated;
grant all on public.valuation_evidence to service_role;
alter table public.valuation_evidence enable row level security;

create policy "staff read valuation evidence" on public.valuation_evidence
  for select to authenticated using (public.is_any_staff());
create policy "managers read their valuation evidence" on public.valuation_evidence
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));

create or replace function public.protect_valuation_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status public.portfolio_valuation_status;
begin
  select status into current_status from public.portfolio_valuations
   where id = coalesce(old.valuation_id, new.valuation_id);
  if current_status in ('effective', 'superseded') then
    raise exception 'Evidence for a completed valuation is preserved; attach a new version instead.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger protect_valuation_evidence
  before update or delete on public.valuation_evidence
  for each row execute function public.protect_valuation_evidence();

create table public.valuation_policies (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.ledger_books(id) on delete cascade,
  offering_id uuid references public.offerings(id) on delete cascade,
  asset_class public.portfolio_asset_class,
  source_priority jsonb not null
    default '["independent_third_party","observable_transaction","recent_financing","public_market","manager_mark"]'::jsonb,
  staleness_days integer not null default 120,
  increase_threshold_pct numeric not null default 25,
  decrease_threshold_pct numeric not null default 20,
  material_change_cents bigint not null default 2500000,
  evidence_required boolean not null default true,
  manager_may_approve boolean not null default false,
  manager_review_required boolean not null default false,
  unrealized_policy_enabled boolean not null default true,
  investment_account_code text not null default '1110',
  unrealized_account_code text not null default '4400',
  realized_account_code text not null default '4300',
  cost_account_code text not null default '1100',
  cash_account_code text not null default '1000',
  version integer not null default 1,
  supersedes_id uuid references public.valuation_policies(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index valuation_policies_scope_idx
  on public.valuation_policies (offering_id, asset_class, is_active);

grant select on public.valuation_policies to authenticated;
grant all on public.valuation_policies to service_role;
alter table public.valuation_policies enable row level security;

create policy "staff read valuation policies" on public.valuation_policies
  for select to authenticated using (public.is_any_staff());
create policy "managers read their valuation policies" on public.valuation_policies
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));

create table public.valuation_events (
  id uuid primary key default gen_random_uuid(),
  valuation_id uuid references public.portfolio_valuations(id) on delete cascade,
  asset_id uuid references public.portfolio_assets(id) on delete cascade,
  offering_id uuid references public.offerings(id) on delete set null,
  actor_user_id uuid,
  actor_role text,
  action text not null,
  from_status text,
  to_status text,
  reason text,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index valuation_events_valuation_idx on public.valuation_events (valuation_id, created_at desc);

grant select on public.valuation_events to authenticated;
grant all on public.valuation_events to service_role;
alter table public.valuation_events enable row level security;

create policy "staff read valuation events" on public.valuation_events
  for select to authenticated using (public.is_any_staff());
create policy "managers read their valuation events" on public.valuation_events
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));

create or replace function public.protect_valuation_events()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Valuation history is append-only.';
end;
$$;

create trigger protect_valuation_events
  before update or delete on public.valuation_events
  for each row execute function public.protect_valuation_events();

create table public.portfolio_realizations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.portfolio_assets(id) on delete cascade,
  book_id uuid not null references public.ledger_books(id) on delete cascade,
  offering_id uuid references public.offerings(id) on delete set null,
  disposition_date date not null,
  quantity_sold numeric,
  proceeds_cents bigint not null default 0,
  cost_basis_relieved_cents bigint not null default 0,
  realized_gain_cents bigint not null default 0,
  remaining_quantity numeric,
  remaining_cost_basis_cents bigint not null default 0,
  is_full_disposition boolean not null default false,
  counterparty text,
  bank_transaction_id uuid references public.bank_transactions(id) on delete set null,
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  note text,
  recorded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index portfolio_realizations_asset_idx
  on public.portfolio_realizations (asset_id, disposition_date desc);
create unique index portfolio_realizations_journal_unique
  on public.portfolio_realizations (journal_entry_id) where journal_entry_id is not null;
create unique index portfolio_realizations_bank_unique
  on public.portfolio_realizations (bank_transaction_id) where bank_transaction_id is not null;

grant select on public.portfolio_realizations to authenticated;
grant all on public.portfolio_realizations to service_role;
alter table public.portfolio_realizations enable row level security;

create policy "staff read realizations" on public.portfolio_realizations
  for select to authenticated using (public.is_any_staff());
create policy "managers read their realizations" on public.portfolio_realizations
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));
