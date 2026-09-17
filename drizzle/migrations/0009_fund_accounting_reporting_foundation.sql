-- Fund accounting, reporting and cap-table reporting foundation.
-- Additive only. Nothing existing is altered: capital_account_statements,
-- fund_valuations, fund_distributions, fund_tax_documents and the ct_* cap
-- table keep working exactly as they do today. This establishes the canonical
-- records those surfaces will migrate onto.

-- ----------------------------------------------------------------- vocabulary

create type public.ledger_basis as enum ('accrual', 'cash', 'tax');
create type public.ledger_account_type as enum ('asset', 'liability', 'equity', 'income', 'expense');
create type public.accounting_period_status as enum ('open', 'soft_closed', 'review', 'closed', 'locked');
create type public.journal_status as enum ('draft', 'reviewed', 'approved', 'posted', 'reversed');
create type public.journal_source as enum (
  'manual', 'bank_reconciliation', 'payment', 'capital_call', 'distribution',
  'fee_accrual', 'expense', 'valuation', 'allocation', 'adjustment', 'reversal', 'migration'
);
create type public.valuation_status as enum ('draft', 'review', 'approved', 'superseded', 'rejected');
create type public.nav_status as enum ('draft', 'review', 'approved', 'published', 'superseded');
create type public.report_status as enum ('draft', 'review', 'approved', 'published', 'superseded');
create type public.report_domain as enum ('fund_accounting', 'cap_table');
create type public.tax_documentation_form as enum (
  'w9', 'w8ben', 'w8bene', 'w8imy', 'w8eci', 'w8exp', 'none_on_file', 'other'
);
create type public.tax_workflow_status as enum (
  'not_started', 'in_progress', 'harmonious_review', 'client_review', 'approved', 'complete', 'not_applicable'
);

-- --------------------------------------------------------------- ledger books

create table public.ledger_books (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  offering_id uuid references public.offerings(id) on delete set null,
  client_entity_id uuid references public.client_entities(id) on delete set null,
  ct_company_id uuid references public.ct_companies(id) on delete set null,
  domain public.report_domain not null default 'fund_accounting',
  name text not null,
  functional_currency text not null default 'USD',
  basis public.ledger_basis not null default 'accrual',
  fiscal_year_end_month smallint not null default 12,
  allocation_policy jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ledger_books_offering_idx on public.ledger_books (offering_id);
create index ledger_books_company_idx on public.ledger_books (ct_company_id);

grant select on public.ledger_books to authenticated;
grant all on public.ledger_books to service_role;
alter table public.ledger_books enable row level security;

-- ---------------------------------------------------------- chart of accounts

create table public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.ledger_books(id) on delete cascade,
  parent_account_id uuid references public.chart_of_accounts(id) on delete set null,
  code text not null,
  name text not null,
  account_type public.ledger_account_type not null,
  -- cash, investments, receivable, payable, accrued_expense, management_fee,
  -- organizational_expense, realized_gain, unrealized_gain, investment_income,
  -- interest, dividend, contribution, distribution, carried_interest,
  -- partner_capital, withholding, tax_adjustment, other
  subtype text not null default 'other',
  normal_balance text not null default 'debit',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, code)
);
create index chart_of_accounts_book_idx on public.chart_of_accounts (book_id);

grant select on public.chart_of_accounts to authenticated;
grant all on public.chart_of_accounts to service_role;
alter table public.chart_of_accounts enable row level security;

-- --------------------------------------------------------- accounting periods

create table public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.ledger_books(id) on delete cascade,
  label text not null,
  period_start date not null,
  period_end date not null,
  status public.accounting_period_status not null default 'open',
  soft_closed_at timestamptz, soft_closed_by uuid,
  review_started_at timestamptz,
  closed_at timestamptz, closed_by uuid,
  locked_at timestamptz, locked_by uuid,
  reopened_at timestamptz, reopened_by uuid, reopen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, period_start, period_end)
);
create index accounting_periods_book_idx on public.accounting_periods (book_id, period_end desc);

grant select on public.accounting_periods to authenticated;
grant all on public.accounting_periods to service_role;
alter table public.accounting_periods enable row level security;

create table public.accounting_period_events (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.accounting_periods(id) on delete cascade,
  actor_user_id uuid,
  from_status public.accounting_period_status,
  to_status public.accounting_period_status not null,
  reason text,
  created_at timestamptz not null default now()
);
grant select on public.accounting_period_events to authenticated;
grant all on public.accounting_period_events to service_role;
alter table public.accounting_period_events enable row level security;

-- ------------------------------------------------------------ journal entries

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.ledger_books(id) on delete cascade,
  period_id uuid references public.accounting_periods(id) on delete set null,
  entry_no bigserial,
  entry_date date not null,
  memo text,
  source public.journal_source not null default 'manual',
  source_table text,
  source_id uuid,
  status public.journal_status not null default 'draft',
  reverses_entry_id uuid references public.journal_entries(id) on delete set null,
  adjusts_entry_id uuid references public.journal_entries(id) on delete set null,
  prepared_by uuid, prepared_at timestamptz not null default now(),
  reviewed_by uuid, reviewed_at timestamptz,
  approved_by uuid, approved_at timestamptz,
  posted_by uuid, posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index journal_entries_book_idx on public.journal_entries (book_id, entry_date desc);
create index journal_entries_period_idx on public.journal_entries (period_id);
create index journal_entries_source_idx on public.journal_entries (source_table, source_id);

grant select on public.journal_entries to authenticated;
grant all on public.journal_entries to service_role;
alter table public.journal_entries enable row level security;

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  line_no integer not null default 1,
  account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  debit_cents bigint not null default 0,
  credit_cents bigint not null default 0,
  -- dimensional resolution: fund / entity / investment / investor / transaction
  offering_id uuid references public.offerings(id) on delete set null,
  client_entity_id uuid references public.client_entities(id) on delete set null,
  investment_id uuid,
  investor_user_id uuid,
  investment_profile_id uuid references public.investment_profiles(id) on delete set null,
  application_id uuid references public.investor_applications(id) on delete set null,
  memo text,
  created_at timestamptz not null default now(),
  constraint journal_lines_single_side check (debit_cents = 0 or credit_cents = 0),
  constraint journal_lines_non_negative check (debit_cents >= 0 and credit_cents >= 0)
);
create index journal_lines_entry_idx on public.journal_lines (entry_id);
create index journal_lines_account_idx on public.journal_lines (account_id);
create index journal_lines_investor_idx on public.journal_lines (investor_user_id);

grant select on public.journal_lines to authenticated;
grant all on public.journal_lines to service_role;
alter table public.journal_lines enable row level security;

create table public.journal_entry_events (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  actor_user_id uuid,
  from_status public.journal_status,
  to_status public.journal_status not null,
  reason text,
  snapshot jsonb,
  created_at timestamptz not null default now()
);
grant select on public.journal_entry_events to authenticated;
grant all on public.journal_entry_events to service_role;
alter table public.journal_entry_events enable row level security;

-- ------------------------------------------- bank reconciliation to the ledger

create table public.bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.ledger_books(id) on delete set null,
  offering_id uuid references public.offerings(id) on delete set null,
  bank_transaction_id uuid not null references public.bank_transactions(id) on delete cascade,
  -- ingested -> auto_matched -> harmonious_reviewed -> acknowledged -> reconciled -> posted -> rejected
  status text not null default 'ingested',
  matched_application_id uuid references public.investor_applications(id) on delete set null,
  matched_payment_id uuid references public.payments(id) on delete set null,
  matched_invoice_id uuid references public.invoices(id) on delete set null,
  matched_wire_request_id uuid references public.wire_requests(id) on delete set null,
  match_confidence text,
  auto_matched boolean not null default false,
  reviewed_by uuid, reviewed_at timestamptz,
  acknowledged_by uuid, acknowledged_at timestamptz,
  acknowledgement_required boolean not null default false,
  reconciled_by uuid, reconciled_at timestamptz,
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  posted_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bank_transaction_id)
);
-- One bank transaction can only ever produce one posted journal entry.
create unique index bank_reconciliations_entry_unique
  on public.bank_reconciliations (journal_entry_id)
  where journal_entry_id is not null;

grant select on public.bank_reconciliations to authenticated;
grant all on public.bank_reconciliations to service_role;
alter table public.bank_reconciliations enable row level security;

-- ------------------------------------------------------------------ valuations

create table public.asset_valuations (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.ledger_books(id) on delete cascade,
  offering_id uuid references public.offerings(id) on delete set null,
  asset_name text not null,
  asset_class text not null default 'private_company',
  ct_company_id uuid references public.ct_companies(id) on delete set null,
  ct_security_id uuid references public.ct_securities(id) on delete set null,
  quantity numeric,
  ownership_pct numeric,
  cost_basis_cents bigint not null default 0,
  value_cents bigint not null default 0,
  valuation_date date not null,
  methodology text not null default 'unspecified',
  source text,
  supporting_document_path text,
  status public.valuation_status not null default 'draft',
  prior_valuation_id uuid references public.asset_valuations(id) on delete set null,
  realized_change_cents bigint not null default 0,
  unrealized_change_cents bigint not null default 0,
  prepared_by uuid, reviewed_by uuid, approved_by uuid, approved_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index asset_valuations_book_idx on public.asset_valuations (book_id, valuation_date desc);

grant select on public.asset_valuations to authenticated;
grant all on public.asset_valuations to service_role;
alter table public.asset_valuations enable row level security;

-- ------------------------------------------------------------------------ NAV

create table public.nav_versions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.ledger_books(id) on delete cascade,
  offering_id uuid references public.offerings(id) on delete set null,
  period_id uuid references public.accounting_periods(id) on delete set null,
  as_of_date date not null,
  version integer not null default 1,
  status public.nav_status not null default 'draft',
  gross_asset_value_cents bigint not null default 0,
  cash_cents bigint not null default 0,
  investments_at_cost_cents bigint not null default 0,
  investments_fair_value_cents bigint not null default 0,
  liabilities_cents bigint not null default 0,
  accrued_expenses_cents bigint not null default 0,
  management_fee_cents bigint not null default 0,
  carried_interest_cents bigint not null default 0,
  partner_capital_cents bigint not null default 0,
  contributions_cents bigint not null default 0,
  distributions_cents bigint not null default 0,
  realized_gain_cents bigint not null default 0,
  unrealized_gain_cents bigint not null default 0,
  units_outstanding numeric,
  nav_per_unit_cents bigint,
  methodology text not null default 'ledger_derived',
  valuation_source text,
  ledger_snapshot jsonb not null default '{}'::jsonb,
  prepared_by uuid, prepared_at timestamptz not null default now(),
  reviewed_by uuid, reviewed_at timestamptz,
  approved_by uuid, approved_at timestamptz,
  published_by uuid, published_at timestamptz,
  supersedes_id uuid references public.nav_versions(id) on delete set null,
  revision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, as_of_date, version)
);
create index nav_versions_book_idx on public.nav_versions (book_id, as_of_date desc);

grant select on public.nav_versions to authenticated;
grant all on public.nav_versions to service_role;
alter table public.nav_versions enable row level security;

-- ------------------------------------------------------------ capital accounts

create table public.capital_accounts (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.ledger_books(id) on delete cascade,
  offering_id uuid references public.offerings(id) on delete set null,
  period_id uuid references public.accounting_periods(id) on delete set null,
  nav_version_id uuid references public.nav_versions(id) on delete set null,
  investor_user_id uuid,
  investment_profile_id uuid references public.investment_profiles(id) on delete set null,
  application_id uuid references public.investor_applications(id) on delete set null,
  period_start date not null,
  period_end date not null,
  beginning_capital_cents bigint not null default 0,
  contributions_cents bigint not null default 0,
  allocated_income_cents bigint not null default 0,
  allocated_loss_cents bigint not null default 0,
  distributions_cents bigint not null default 0,
  other_adjustments_cents bigint not null default 0,
  ending_capital_cents bigint not null default 0,
  commitment_cents bigint not null default 0,
  unfunded_commitment_cents bigint not null default 0,
  ownership_pct numeric,
  allocation_method text not null default 'pro_rata_capital',
  allocation_inputs jsonb not null default '{}'::jsonb,
  status public.report_status not null default 'draft',
  version integer not null default 1,
  supersedes_id uuid references public.capital_accounts(id) on delete set null,
  generated_by uuid, generated_at timestamptz not null default now(),
  reviewed_by uuid, approved_by uuid, published_by uuid, published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index capital_accounts_investor_idx on public.capital_accounts (investor_user_id, period_end desc);
create index capital_accounts_book_idx on public.capital_accounts (book_id, period_end desc);

grant select on public.capital_accounts to authenticated;
grant all on public.capital_accounts to service_role;
alter table public.capital_accounts enable row level security;

-- --------------------------------------------------------------- performance

create table public.performance_calculations (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.ledger_books(id) on delete cascade,
  offering_id uuid references public.offerings(id) on delete set null,
  scope text not null default 'fund', -- fund | investor
  investor_user_id uuid,
  investment_profile_id uuid references public.investment_profiles(id) on delete set null,
  period_start date not null,
  period_end date not null,
  beginning_value_cents bigint not null default 0,
  ending_value_cents bigint not null default 0,
  contributions_cents bigint not null default 0,
  distributions_cents bigint not null default 0,
  realized_gain_cents bigint not null default 0,
  unrealized_gain_cents bigint not null default 0,
  gross_return_bps integer,
  net_return_bps integer,
  irr_bps integer,
  twr_bps integer,
  moic numeric,
  dpi numeric,
  rvpi numeric,
  tvpi numeric,
  methodology_version text not null default 'v1',
  inputs jsonb not null default '{}'::jsonb,
  nav_version_id uuid references public.nav_versions(id) on delete set null,
  capital_account_id uuid references public.capital_accounts(id) on delete set null,
  status public.report_status not null default 'draft',
  calculated_by uuid, calculated_at timestamptz not null default now(),
  approved_by uuid, published_at timestamptz,
  created_at timestamptz not null default now()
);
create index performance_book_idx on public.performance_calculations (book_id, period_end desc);
create index performance_investor_idx on public.performance_calculations (investor_user_id, period_end desc);

grant select on public.performance_calculations to authenticated;
grant all on public.performance_calculations to service_role;
alter table public.performance_calculations enable row level security;

-- ------------------------------------------------------- report registry

create table public.financial_reports (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.ledger_books(id) on delete set null,
  domain public.report_domain not null default 'fund_accounting',
  offering_id uuid references public.offerings(id) on delete set null,
  client_entity_id uuid references public.client_entities(id) on delete set null,
  ct_company_id uuid references public.ct_companies(id) on delete set null,
  -- balance_sheet, income_statement, changes_in_capital, cash_flow,
  -- schedule_of_investments, trial_balance, general_ledger,
  -- capital_account_statement, lp_statement, performance, management_fee,
  -- carry_waterfall, commitment_schedule, unfunded_commitments,
  -- capital_call_history, distribution_history, investor_roster,
  -- investor_ownership, cash_activity, expense_report, gain_report,
  -- valuation_report, withholding_report, audit_support, regulatory_export,
  -- cap_table_current, cap_table_fully_diluted, stakeholder_statement,
  -- security_ledger, transaction_history, option_vesting_report,
  -- financing_round_report, dilution_analysis
  report_type text not null,
  subject_user_id uuid,
  subject_profile_id uuid references public.investment_profiles(id) on delete set null,
  ct_stakeholder_id uuid references public.ct_stakeholders(id) on delete set null,
  period_id uuid references public.accounting_periods(id) on delete set null,
  period_start date,
  period_end date,
  version integer not null default 1,
  status public.report_status not null default 'draft',
  source_cutoff_at timestamptz not null default now(),
  methodology_version text not null default 'v1',
  nav_version_id uuid references public.nav_versions(id) on delete set null,
  accounting_snapshot jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  storage_path text,
  generated_by uuid, generated_at timestamptz not null default now(),
  reviewed_by uuid, reviewed_at timestamptz,
  approved_by uuid, approved_at timestamptz,
  published_by uuid, published_at timestamptz,
  supersedes_id uuid references public.financial_reports(id) on delete set null,
  superseded_by_id uuid references public.financial_reports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index financial_reports_book_idx on public.financial_reports (book_id, report_type, period_end desc);
create index financial_reports_subject_idx on public.financial_reports (subject_user_id, period_end desc);
create index financial_reports_company_idx on public.financial_reports (ct_company_id, report_type);

grant select on public.financial_reports to authenticated;
grant all on public.financial_reports to service_role;
alter table public.financial_reports enable row level security;

-- ------------------------------------------------------------ tax reporting

create table public.investor_tax_profiles (
  id uuid primary key default gen_random_uuid(),
  investment_profile_id uuid references public.investment_profiles(id) on delete set null,
  investor_user_id uuid,
  -- us_individual, us_entity, us_partnership, us_trust, tax_exempt,
  -- foreign_individual, foreign_entity, foreign_partnership, unknown
  classification text not null default 'unknown',
  documentation_form public.tax_documentation_form not null default 'none_on_file',
  documentation_status public.tax_workflow_status not null default 'not_started',
  tin_on_file boolean not null default false,
  tax_residency_country text,
  treaty_country text,
  treaty_rate_bps integer,
  default_withholding_rate_bps integer,
  documentation_effective_on date,
  documentation_expires_on date,
  document_id uuid references public.fund_tax_documents(id) on delete set null,
  reviewed_by uuid, reviewed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index investor_tax_profiles_user_idx on public.investor_tax_profiles (investor_user_id);

grant select on public.investor_tax_profiles to authenticated;
grant all on public.investor_tax_profiles to service_role;
alter table public.investor_tax_profiles enable row level security;

create table public.tax_filings (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.ledger_books(id) on delete cascade,
  offering_id uuid references public.offerings(id) on delete set null,
  client_entity_id uuid references public.client_entities(id) on delete set null,
  tax_year integer not null,
  form_type text not null, -- form_1065, form_1042, state_composite, other
  accounting_closed boolean not null default false,
  allocations_status public.tax_workflow_status not null default 'not_started',
  preparation_status public.tax_workflow_status not null default 'not_started',
  filing_status public.tax_workflow_status not null default 'not_started',
  delivery_status public.tax_workflow_status not null default 'not_started',
  period_id uuid references public.accounting_periods(id) on delete set null,
  prepared_by uuid, reviewed_by uuid, approved_by uuid, filed_by uuid, filed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, tax_year, form_type)
);
grant select on public.tax_filings to authenticated;
grant all on public.tax_filings to service_role;
alter table public.tax_filings enable row level security;

create table public.tax_allocations (
  id uuid primary key default gen_random_uuid(),
  filing_id uuid references public.tax_filings(id) on delete cascade,
  book_id uuid not null references public.ledger_books(id) on delete cascade,
  tax_year integer not null,
  investor_user_id uuid,
  investment_profile_id uuid references public.investment_profiles(id) on delete set null,
  capital_account_id uuid references public.capital_accounts(id) on delete set null,
  ordinary_income_cents bigint not null default 0,
  interest_income_cents bigint not null default 0,
  dividend_income_cents bigint not null default 0,
  short_term_gain_cents bigint not null default 0,
  long_term_gain_cents bigint not null default 0,
  expenses_cents bigint not null default 0,
  withholding_cents bigint not null default 0,
  other_items jsonb not null default '{}'::jsonb,
  allocation_method text not null default 'pro_rata_capital',
  status public.tax_workflow_status not null default 'not_started',
  prepared_by uuid, approved_by uuid, approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tax_allocations_year_idx on public.tax_allocations (book_id, tax_year);

grant select on public.tax_allocations to authenticated;
grant all on public.tax_allocations to service_role;
alter table public.tax_allocations enable row level security;

create table public.tax_forms (
  id uuid primary key default gen_random_uuid(),
  filing_id uuid references public.tax_filings(id) on delete set null,
  book_id uuid not null references public.ledger_books(id) on delete cascade,
  offering_id uuid references public.offerings(id) on delete set null,
  tax_year integer not null,
  form_type text not null, -- schedule_k1, form_1042s, form_1099, other
  investor_user_id uuid,
  investment_profile_id uuid references public.investment_profiles(id) on delete set null,
  allocation_id uuid references public.tax_allocations(id) on delete set null,
  version integer not null default 1,
  is_amended boolean not null default false,
  amends_form_id uuid references public.tax_forms(id) on delete set null,
  preparation_status public.tax_workflow_status not null default 'not_started',
  filing_status public.tax_workflow_status not null default 'not_started',
  delivery_status public.tax_workflow_status not null default 'not_started',
  document_id uuid references public.fund_tax_documents(id) on delete set null,
  storage_path text,
  payload jsonb not null default '{}'::jsonb,
  prepared_by uuid, reviewed_by uuid, approved_by uuid,
  delivered_at timestamptz, delivered_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tax_forms_investor_idx on public.tax_forms (investor_user_id, tax_year);

grant select on public.tax_forms to authenticated;
grant all on public.tax_forms to service_role;
alter table public.tax_forms enable row level security;

create table public.withholding_records (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.ledger_books(id) on delete cascade,
  offering_id uuid references public.offerings(id) on delete set null,
  tax_year integer not null,
  recipient_user_id uuid,
  investment_profile_id uuid references public.investment_profiles(id) on delete set null,
  tax_profile_id uuid references public.investor_tax_profiles(id) on delete set null,
  tax_residency_country text,
  documentation_form public.tax_documentation_form not null default 'none_on_file',
  income_type text not null default 'other',
  income_code text,
  exemption_code text,
  gross_amount_cents bigint not null default 0,
  withholding_rate_bps integer not null default 0,
  amount_withheld_cents bigint not null default 0,
  deposited_at date,
  form_id uuid references public.tax_forms(id) on delete set null,
  status public.tax_workflow_status not null default 'not_started',
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index withholding_year_idx on public.withholding_records (book_id, tax_year);

grant select on public.withholding_records to authenticated;
grant all on public.withholding_records to service_role;
alter table public.withholding_records enable row level security;

-- ----------------------------------------------------------- immutability

create or replace function public.protect_posted_journal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('posted', 'reversed') then
      raise exception 'A posted journal entry cannot be deleted. Post a reversing entry instead.';
    end if;
    return old;
  end if;
  if old.status = 'posted' and new.status not in ('posted', 'reversed') then
    raise exception 'A posted journal entry cannot return to an earlier state.';
  end if;
  if old.status = 'posted' then
    if new.book_id <> old.book_id or new.entry_date <> old.entry_date
       or new.source is distinct from old.source or new.posted_at is distinct from old.posted_at
       or new.posted_by is distinct from old.posted_by then
      raise exception 'Posted accounting entries are immutable.';
    end if;
  end if;
  return new;
end;
$$;

create trigger journal_entries_immutable
  before update or delete on public.journal_entries
  for each row execute function public.protect_posted_journal();

create or replace function public.protect_posted_journal_lines()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  entry_status public.journal_status;
begin
  select status into entry_status from public.journal_entries
   where id = coalesce(new.entry_id, old.entry_id);
  if entry_status in ('posted', 'reversed') then
    raise exception 'The lines of a posted journal entry cannot be changed.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger journal_lines_immutable
  before insert or update or delete on public.journal_lines
  for each row execute function public.protect_posted_journal_lines();

create or replace function public.protect_published_nav()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'published' then
      raise exception 'A published NAV cannot be deleted. Publish a revised version instead.';
    end if;
    return old;
  end if;
  if old.status = 'published' and new.status not in ('published', 'superseded') then
    raise exception 'A published NAV cannot be reopened. Publish a revised version instead.';
  end if;
  return new;
end;
$$;

create trigger nav_versions_immutable
  before update or delete on public.nav_versions
  for each row execute function public.protect_published_nav();

create or replace function public.protect_published_report()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'published' then
      raise exception 'A published report cannot be deleted. Publish a new version instead.';
    end if;
    return old;
  end if;
  if old.status = 'published' then
    if new.payload is distinct from old.payload
       or new.accounting_snapshot is distinct from old.accounting_snapshot
       or new.version <> old.version
       or new.period_end is distinct from old.period_end then
      raise exception 'Published reports are immutable. Publish a superseding version instead.';
    end if;
  end if;
  return new;
end;
$$;

create trigger financial_reports_immutable
  before update or delete on public.financial_reports
  for each row execute function public.protect_published_report();

-- A closed or locked period refuses new postings outright.
create or replace function public.guard_period_posting()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  period_status public.accounting_period_status;
begin
  if new.status <> 'posted' or (tg_op = 'UPDATE' and old.status = 'posted') then
    return new;
  end if;
  if new.period_id is null then return new; end if;
  select status into period_status from public.accounting_periods where id = new.period_id;
  if period_status in ('closed', 'locked') then
    raise exception 'That accounting period is closed. Reopen it with an authorised adjustment first.';
  end if;
  return new;
end;
$$;

create trigger journal_entries_period_guard
  before insert or update on public.journal_entries
  for each row execute function public.guard_period_posting();

-- ------------------------------------------------------------------- policies
-- Reads only. Every write goes through an authorised server workflow using the
-- service role, exactly as the financial-control hardening requires.

create policy "staff read ledger books" on public.ledger_books
  for select to authenticated using (public.is_any_staff());
create policy "managers read their ledger books" on public.ledger_books
  for select to authenticated using (offering_id is not null and private.manages_offering(offering_id));

create policy "staff read accounts" on public.chart_of_accounts
  for select to authenticated using (public.is_any_staff());
create policy "managers read their accounts" on public.chart_of_accounts
  for select to authenticated using (exists (
    select 1 from public.ledger_books b
     where b.id = chart_of_accounts.book_id and b.offering_id is not null
       and private.manages_offering(b.offering_id)));

create policy "staff read periods" on public.accounting_periods
  for select to authenticated using (public.is_any_staff());
create policy "managers read their periods" on public.accounting_periods
  for select to authenticated using (exists (
    select 1 from public.ledger_books b
     where b.id = accounting_periods.book_id and b.offering_id is not null
       and private.manages_offering(b.offering_id)));

create policy "staff read period events" on public.accounting_period_events
  for select to authenticated using (public.is_any_staff());

create policy "staff read journals" on public.journal_entries
  for select to authenticated using (public.is_any_staff());
create policy "managers read their journals" on public.journal_entries
  for select to authenticated using (exists (
    select 1 from public.ledger_books b
     where b.id = journal_entries.book_id and b.offering_id is not null
       and private.manages_offering(b.offering_id)));

create policy "staff read journal lines" on public.journal_lines
  for select to authenticated using (public.is_any_staff());
create policy "managers read their journal lines" on public.journal_lines
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));

create policy "staff read journal events" on public.journal_entry_events
  for select to authenticated using (public.is_any_staff());

create policy "staff read reconciliations" on public.bank_reconciliations
  for select to authenticated using (public.is_any_staff());
create policy "managers read their reconciliations" on public.bank_reconciliations
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));

create policy "staff read valuations" on public.asset_valuations
  for select to authenticated using (public.is_any_staff());
create policy "managers read their valuations" on public.asset_valuations
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));

create policy "staff read nav" on public.nav_versions
  for select to authenticated using (public.is_any_staff());
create policy "managers read their nav" on public.nav_versions
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));
create policy "investors read published nav of their funds" on public.nav_versions
  for select to authenticated using (
    status = 'published' and offering_id is not null and exists (
      select 1 from public.investor_applications a
       where a.offering_id = nav_versions.offering_id and a.user_id = auth.uid()));

create policy "staff read capital accounts" on public.capital_accounts
  for select to authenticated using (public.is_any_staff());
create policy "managers read their capital accounts" on public.capital_accounts
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));
create policy "investors read their own capital accounts" on public.capital_accounts
  for select to authenticated using (investor_user_id = auth.uid());

create policy "staff read performance" on public.performance_calculations
  for select to authenticated using (public.is_any_staff());
create policy "managers read their performance" on public.performance_calculations
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));
create policy "investors read their own performance" on public.performance_calculations
  for select to authenticated using (investor_user_id = auth.uid());

create policy "staff read reports" on public.financial_reports
  for select to authenticated using (public.is_any_staff());
create policy "managers read their reports" on public.financial_reports
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));
create policy "investors read their own published reports" on public.financial_reports
  for select to authenticated using (
    status = 'published' and subject_user_id = auth.uid());
create policy "cap table holders read their published reports" on public.financial_reports
  for select to authenticated using (
    status = 'published' and ct_company_id is not null and public.ct_can_view(ct_company_id));

create policy "staff read tax profiles" on public.investor_tax_profiles
  for select to authenticated using (public.is_any_staff());
create policy "investors read their own tax profile" on public.investor_tax_profiles
  for select to authenticated using (investor_user_id = auth.uid());

create policy "staff read tax filings" on public.tax_filings
  for select to authenticated using (public.is_any_staff());
create policy "managers read their tax filings" on public.tax_filings
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));

create policy "staff read tax allocations" on public.tax_allocations
  for select to authenticated using (public.is_any_staff());
create policy "investors read their own tax allocations" on public.tax_allocations
  for select to authenticated using (investor_user_id = auth.uid());

create policy "staff read tax forms" on public.tax_forms
  for select to authenticated using (public.is_any_staff());
create policy "managers read their tax forms" on public.tax_forms
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));
create policy "investors read their own delivered tax forms" on public.tax_forms
  for select to authenticated using (
    investor_user_id = auth.uid() and delivery_status = 'complete');

create policy "staff read withholding" on public.withholding_records
  for select to authenticated using (public.is_any_staff());
create policy "managers read their withholding" on public.withholding_records
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));
create policy "investors read their own withholding" on public.withholding_records
  for select to authenticated using (recipient_user_id = auth.uid());