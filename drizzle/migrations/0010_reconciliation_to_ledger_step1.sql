-- Step 1: automated reconciliation into the general ledger.
-- Additive. The existing bank feed, auto-matcher and financial controls keep
-- working; this adds classification, posting rules, approval routing,
-- exceptions and end-to-end idempotency.

create type public.cash_transaction_type as enum (
  'investor_contribution', 'capital_call', 'subscription_receipt', 'distribution',
  'management_fee', 'fund_expense', 'organizational_expense', 'portfolio_investment',
  'investment_proceeds', 'interest_income', 'dividend_income', 'internal_transfer',
  'tax_payment', 'withholding', 'receivable_receipt', 'payable_settlement', 'other'
);

create type public.match_confidence as enum ('high', 'medium', 'low', 'unmatched');

create type public.accounting_exception_kind as enum (
  'unmatched_cash', 'duplicate_candidate', 'suspected_duplicate', 'amount_mismatch',
  'account_mismatch', 'unknown_counterparty', 'missing_investor', 'missing_fund',
  'missing_accounting_mapping', 'closed_period_transaction', 'inconsistent_currency',
  'reconciliation_conflict', 'posting_failure'
);

create type public.accounting_exception_status as enum ('open', 'investigating', 'resolved', 'waived');

create type public.reconciliation_approver as enum ('none', 'fund_manager', 'client');

-- ------------------------------------------------------------ posting rules

create table public.posting_rules (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.ledger_books(id) on delete cascade,
  offering_id uuid references public.offerings(id) on delete cascade,
  name text not null,
  transaction_type public.cash_transaction_type not null,
  direction text not null default 'any', -- inflow | outflow | any
  counterparty_pattern text,
  min_amount_cents bigint,
  max_amount_cents bigint,
  debit_account_code text not null,
  credit_account_code text not null,
  approval_required public.reconciliation_approver not null default 'none',
  approval_threshold_cents bigint,
  materiality_threshold_cents bigint not null default 0,
  priority integer not null default 100,
  version integer not null default 1,
  supersedes_id uuid references public.posting_rules(id) on delete set null,
  is_active boolean not null default true,
  effective_from date not null default current_date,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posting_rules_lookup_idx on public.posting_rules (transaction_type, is_active, priority);
create index posting_rules_book_idx on public.posting_rules (book_id);

grant select on public.posting_rules to authenticated;
grant all on public.posting_rules to service_role;
alter table public.posting_rules enable row level security;

create policy "staff read posting rules" on public.posting_rules
  for select to authenticated using (public.is_any_staff());
create policy "managers read their posting rules" on public.posting_rules
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));

-- The platform-wide defaults every fund starts from. A fund-specific rule with a
-- lower priority number always wins, so no accounting treatment is hard-coded.
insert into public.posting_rules
  (name, transaction_type, direction, debit_account_code, credit_account_code,
   approval_required, approval_threshold_cents, priority)
values
  ('Investor contribution', 'investor_contribution', 'inflow', '1000', '3100', 'none', null, 500),
  ('Capital call receipt', 'capital_call', 'inflow', '1000', '3100', 'none', null, 500),
  ('Subscription receipt', 'subscription_receipt', 'inflow', '1000', '3100', 'none', null, 500),
  ('Receivable receipt', 'receivable_receipt', 'inflow', '1000', '1200', 'none', null, 500),
  ('Interest income', 'interest_income', 'inflow', '1000', '4100', 'none', null, 500),
  ('Dividend income', 'dividend_income', 'inflow', '1000', '4200', 'none', null, 500),
  ('Investment proceeds', 'investment_proceeds', 'inflow', '1000', '1100', 'fund_manager', 2500000, 500),
  ('Distribution paid', 'distribution', 'outflow', '3200', '1000', 'fund_manager', 0, 500),
  ('Management fee paid', 'management_fee', 'outflow', '5000', '1000', 'none', null, 500),
  ('Fund expense', 'fund_expense', 'outflow', '5200', '1000', 'none', 2500000, 500),
  ('Organisational expense', 'organizational_expense', 'outflow', '5100', '1000', 'none', null, 500),
  ('Portfolio investment purchase', 'portfolio_investment', 'outflow', '1100', '1000', 'fund_manager', 0, 500),
  ('Payable settlement', 'payable_settlement', 'outflow', '2000', '1000', 'none', null, 500),
  ('Tax payment', 'tax_payment', 'outflow', '5300', '1000', 'none', null, 500),
  ('Withholding remitted', 'withholding', 'outflow', '2400', '1000', 'none', null, 500),
  ('Internal transfer in', 'internal_transfer', 'inflow', '1000', '1000', 'fund_manager', 5000000, 500),
  ('Internal transfer out', 'internal_transfer', 'outflow', '1000', '1000', 'fund_manager', 5000000, 500);

-- ------------------------------------- classification on the reconciliation row

alter table public.bank_reconciliations
  add column transaction_type public.cash_transaction_type,
  add column confidence public.match_confidence not null default 'unmatched',
  add column match_reasons jsonb not null default '[]'::jsonb,
  add column conflicts jsonb not null default '[]'::jsonb,
  add column matched_records jsonb not null default '{}'::jsonb,
  add column investor_user_id uuid,
  add column investment_profile_id uuid references public.investment_profiles(id) on delete set null,
  add column suggested_debit_account_id uuid references public.chart_of_accounts(id) on delete set null,
  add column suggested_credit_account_id uuid references public.chart_of_accounts(id) on delete set null,
  add column posting_rule_id uuid references public.posting_rules(id) on delete set null,
  add column posting_rule_version integer,
  add column classified_at timestamptz,
  add column approval_required public.reconciliation_approver not null default 'none',
  add column approved_by_harmonious uuid,
  add column harmonious_approved_at timestamptz,
  add column external_approver_id uuid,
  add column external_approved_at timestamptz,
  add column correction_reason text,
  add column corrected_by uuid,
  add column corrected_at timestamptz,
  add column information_requested_at timestamptz,
  add column information_request text;

create index bank_reconciliations_status_idx on public.bank_reconciliations (status, offering_id);

-- ------------------------------------------------- append-only audit of the queue

create table public.reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.bank_reconciliations(id) on delete cascade,
  bank_transaction_id uuid,
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
create index reconciliation_events_rec_idx on public.reconciliation_events (reconciliation_id, created_at desc);

grant select on public.reconciliation_events to authenticated;
grant all on public.reconciliation_events to service_role;
alter table public.reconciliation_events enable row level security;

create policy "staff read reconciliation events" on public.reconciliation_events
  for select to authenticated using (public.is_any_staff());
create policy "managers read their reconciliation events" on public.reconciliation_events
  for select to authenticated using (exists (
    select 1 from public.bank_reconciliations r
     where r.id = reconciliation_events.reconciliation_id
       and r.offering_id is not null
       and private.manages_offering(r.offering_id)));

create or replace function public.protect_reconciliation_events()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Reconciliation history is append-only.';
end;
$$;

create trigger reconciliation_events_append_only
  before update or delete on public.reconciliation_events
  for each row execute function public.protect_reconciliation_events();

-- -------------------------------------------------------------- exceptions

create table public.accounting_exceptions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.ledger_books(id) on delete set null,
  offering_id uuid references public.offerings(id) on delete set null,
  bank_transaction_id uuid references public.bank_transactions(id) on delete set null,
  reconciliation_id uuid references public.bank_reconciliations(id) on delete set null,
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  period_id uuid references public.accounting_periods(id) on delete set null,
  kind public.accounting_exception_kind not null,
  status public.accounting_exception_status not null default 'open',
  is_material boolean not null default true,
  detail text,
  context jsonb not null default '{}'::jsonb,
  opened_by uuid,
  opened_at timestamptz not null default now(),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index accounting_exceptions_open_idx on public.accounting_exceptions (status, offering_id);
-- The same open exception is never raised twice for the same transaction.
create unique index accounting_exceptions_unique_open
  on public.accounting_exceptions (coalesce(bank_transaction_id, reconciliation_id), kind)
  where status in ('open', 'investigating');

grant select on public.accounting_exceptions to authenticated;
grant all on public.accounting_exceptions to service_role;
alter table public.accounting_exceptions enable row level security;

create policy "staff read exceptions" on public.accounting_exceptions
  for select to authenticated using (public.is_any_staff());
create policy "managers read their exceptions" on public.accounting_exceptions
  for select to authenticated using (
    offering_id is not null and private.manages_offering(offering_id));

-- ---------------------------------------------------- import-level idempotency

-- The same cash movement re-delivered under a different provider id must not
-- become a second bank transaction.
alter table public.bank_transactions
  add column dedupe_key text;

update public.bank_transactions
   set dedupe_key = offering_id::text || '|' || posted_on::text || '|' || amount_cents::text
       || '|' || lower(regexp_replace(coalesce(name, ''), '[^a-zA-Z0-9]', '', 'g'))
 where dedupe_key is null;

create unique index bank_transactions_dedupe_unique
  on public.bank_transactions (dedupe_key)
  where dedupe_key is not null;

-- --------------------------------------------------------------- close policy

alter table public.ledger_books
  add column close_policy jsonb not null default
    '{"block_on_unreconciled_cash": true, "block_on_open_exceptions": true,
      "block_on_unposted_journals": true, "immaterial_cents": 25000}'::jsonb;