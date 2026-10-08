ALTER TYPE public.journal_source ADD VALUE IF NOT EXISTS 'investment';

-- Formal fee terms: new rows start pending; approved economics are immutable.
ALTER TABLE public.management_fee_terms ALTER COLUMN approval_status SET DEFAULT 'pending';
ALTER TABLE public.management_fee_terms ADD COLUMN IF NOT EXISTS prepared_by uuid;
ALTER TABLE public.management_fee_terms ADD COLUMN IF NOT EXISTS decision_reason text;
ALTER TABLE public.management_fee_terms ADD COLUMN IF NOT EXISTS supersedes_term_id uuid REFERENCES public.management_fee_terms(id);
ALTER TABLE public.management_fee_terms ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

CREATE TABLE IF NOT EXISTS public.management_fee_term_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id uuid NOT NULL REFERENCES public.management_fee_terms(id),
  offering_id uuid NOT NULL,
  action text NOT NULL,
  actor_user_id uuid,
  reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.management_fee_term_events TO service_role;
ALTER TABLE public.management_fee_term_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_fee_term_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.approval_status = 'approved' THEN RAISE EXCEPTION 'Approved fee terms cannot be deleted; create a new version.'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.approval_status = 'approved' AND (
    NEW.basis IS DISTINCT FROM OLD.basis OR NEW.rate_bps IS DISTINCT FROM OLD.rate_bps OR
    NEW.flat_amount_cents IS DISTINCT FROM OLD.flat_amount_cents OR NEW.frequency IS DISTINCT FROM OLD.frequency OR
    NEW.starts_on IS DISTINCT FROM OLD.starts_on OR NEW.class_id IS DISTINCT FROM OLD.class_id OR
    NEW.position_id IS DISTINCT FROM OLD.position_id OR NEW.step_downs IS DISTINCT FROM OLD.step_downs OR
    NEW.waiver_bps IS DISTINCT FROM OLD.waiver_bps OR NEW.offset_pct IS DISTINCT FROM OLD.offset_pct OR
    NEW.version IS DISTINCT FROM OLD.version OR NEW.approval_status IS DISTINCT FROM OLD.approval_status AND NEW.approval_status <> 'superseded'
  ) THEN
    RAISE EXCEPTION 'Approved fee terms are immutable; create a new version.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_block_fee_term_rewrite ON public.management_fee_terms;
CREATE TRIGGER trg_block_fee_term_rewrite BEFORE UPDATE OR DELETE ON public.management_fee_terms
  FOR EACH ROW EXECUTE FUNCTION public.block_fee_term_rewrite();
DROP TRIGGER IF EXISTS trg_fee_term_events_append_only ON public.management_fee_term_events;
CREATE TRIGGER trg_fee_term_events_append_only BEFORE UPDATE OR DELETE ON public.management_fee_term_events
  FOR EACH ROW EXECUTE FUNCTION public.block_phase7_history_mutation();

-- Configurable account mappings per accounting book.
CREATE TABLE public.fund_account_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL,
  purpose text NOT NULL,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  active boolean NOT NULL DEFAULT true,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  retired_by uuid
);
CREATE UNIQUE INDEX fund_account_mappings_active_uq ON public.fund_account_mappings(book_id, purpose) WHERE active;
GRANT ALL ON public.fund_account_mappings TO service_role;
ALTER TABLE public.fund_account_mappings ENABLE ROW LEVEL SECURITY;

-- Investment purchase transactions (distinct from opening positions).
CREATE TABLE public.fund_investment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL,
  book_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('purchase','additional_purchase')),
  asset_id uuid REFERENCES public.portfolio_assets(id),
  new_issuer_name text,
  new_asset_name text,
  new_asset_class text,
  instrument text,
  trade_date date NOT NULL,
  settlement_date date,
  quantity numeric,
  unit_price_cents bigint,
  principal_cents bigint NOT NULL CHECK (principal_cents > 0),
  transaction_cost_cents bigint NOT NULL DEFAULT 0 CHECK (transaction_cost_cents >= 0),
  total_cost_cents bigint GENERATED ALWAYS AS (principal_cents + transaction_cost_cents) STORED,
  source_reference text NOT NULL,
  evidence_reference text,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','approved','rejected','posted','reversed')),
  prepared_by uuid NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  journal_entry_id uuid REFERENCES public.journal_entries(id),
  bank_line_id uuid REFERENCES public.bank_statement_lines(id),
  reversal_journal_id uuid REFERENCES public.journal_entries(id),
  reversal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_id, idempotency_key)
);
CREATE UNIQUE INDEX fund_investment_tx_bank_line_uq ON public.fund_investment_transactions(bank_line_id) WHERE bank_line_id IS NOT NULL AND status <> 'rejected';
GRANT ALL ON public.fund_investment_transactions TO service_role;
ALTER TABLE public.fund_investment_transactions ENABLE ROW LEVEL SECURITY;

-- Fund expenses: paid or accrued, with payable settlement.
CREATE TABLE public.fund_expense_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL,
  book_id uuid NOT NULL,
  category text NOT NULL,
  vendor text NOT NULL,
  description text NOT NULL,
  invoice_number text,
  invoice_date date,
  service_start date,
  service_end date,
  expense_date date NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  payment_mode text NOT NULL CHECK (payment_mode IN ('paid','accrued')),
  paid_on date,
  source_reference text NOT NULL,
  evidence_reference text,
  fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','approved','rejected','posted','reversed')),
  prepared_by uuid NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  journal_entry_id uuid REFERENCES public.journal_entries(id),
  bank_line_id uuid REFERENCES public.bank_statement_lines(id),
  reversal_journal_id uuid REFERENCES public.journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_id, fingerprint)
);
GRANT ALL ON public.fund_expense_records TO service_role;
ALTER TABLE public.fund_expense_records ENABLE ROW LEVEL SECURITY;

-- Settlement of an existing payable (new accrual or opening liability) - never a new expense.
CREATE TABLE public.fund_payable_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL,
  book_id uuid NOT NULL,
  expense_id uuid REFERENCES public.fund_expense_records(id),
  liability_purpose text NOT NULL,
  opening_liability_reference text,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  paid_on date NOT NULL,
  source_reference text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','approved','rejected','posted','reversed')),
  prepared_by uuid NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  journal_entry_id uuid REFERENCES public.journal_entries(id),
  bank_line_id uuid REFERENCES public.bank_statement_lines(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_id, idempotency_key)
);
GRANT ALL ON public.fund_payable_settlements TO service_role;
ALTER TABLE public.fund_payable_settlements ENABLE ROW LEVEL SECURITY;

-- Append-only audit for all three workflows.
CREATE TABLE public.fund_accounting_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL,
  record_table text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL,
  actor_user_id uuid,
  reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_accounting_events TO service_role;
ALTER TABLE public.fund_accounting_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_fund_accounting_events_append_only BEFORE UPDATE OR DELETE ON public.fund_accounting_events
  FOR EACH ROW EXECUTE FUNCTION public.block_phase7_history_mutation();