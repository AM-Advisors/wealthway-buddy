-- Step 4: investor allocation engine, capital accounts and capital account statements.
-- Additive only. Nothing here changes the ledger, reconciliation, valuation or NAV
-- layers; investor accounting consumes their approved output and never recreates it.

CREATE TABLE IF NOT EXISTS public.investor_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  series_label TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  management_fee_bps INTEGER,
  carry_bps INTEGER,
  preferred_return_bps INTEGER,
  expense_share_pct NUMERIC(9,6),
  liquidity_terms TEXT,
  terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS investor_classes_offering_idx ON public.investor_classes(offering_id, effective_from);

GRANT SELECT ON public.investor_classes TO authenticated;
GRANT ALL ON public.investor_classes TO service_role;
ALTER TABLE public.investor_classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read investor classes" ON public.investor_classes;
CREATE POLICY "staff read investor classes" ON public.investor_classes
  FOR SELECT TO authenticated USING (public.is_any_staff() OR private.manages_offering(offering_id));

CREATE TABLE IF NOT EXISTS public.investor_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  book_id UUID REFERENCES public.ledger_books(id) ON DELETE SET NULL,
  investor_user_id UUID,
  person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  investment_profile_id UUID REFERENCES public.investment_profiles(id) ON DELETE SET NULL,
  application_id UUID REFERENCES public.investor_applications(id) ON DELETE SET NULL,
  class_id UUID REFERENCES public.investor_classes(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  capacity TEXT NOT NULL DEFAULT 'individual',
  is_gp BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending','active','withdrawn','transferred','closed')),
  admitted_on DATE,
  withdrawn_on DATE,
  transferred_to_id UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS investor_positions_unique_idx
  ON public.investor_positions(offering_id, COALESCE(investment_profile_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(application_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS investor_positions_offering_idx ON public.investor_positions(offering_id);
CREATE INDEX IF NOT EXISTS investor_positions_user_idx ON public.investor_positions(investor_user_id);

GRANT SELECT ON public.investor_positions TO authenticated;
GRANT ALL ON public.investor_positions TO service_role;
ALTER TABLE public.investor_positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read investor positions" ON public.investor_positions;
CREATE POLICY "staff read investor positions" ON public.investor_positions
  FOR SELECT TO authenticated USING (public.is_any_staff() OR private.manages_offering(offering_id));
DROP POLICY IF EXISTS "investors read their own positions" ON public.investor_positions;
CREATE POLICY "investors read their own positions" ON public.investor_positions
  FOR SELECT TO authenticated USING (investor_user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.commitment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES public.investor_positions(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'original_commitment','commitment_amendment','capital_call','contribution',
    'pending_contribution','contribution_settled','distribution','return_of_capital',
    'recallable_capital','recall','transfer_in','transfer_out','withdrawal')),
  amount_cents BIGINT NOT NULL,
  effective_date DATE NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  dedupe_key TEXT,
  reason TEXT,
  evidence_path TEXT,
  recorded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS commitment_events_dedupe_idx
  ON public.commitment_events(position_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS commitment_events_position_idx ON public.commitment_events(position_id, effective_date);

GRANT SELECT ON public.commitment_events TO authenticated;
GRANT ALL ON public.commitment_events TO service_role;
ALTER TABLE public.commitment_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read commitment events" ON public.commitment_events;
CREATE POLICY "staff read commitment events" ON public.commitment_events
  FOR SELECT TO authenticated USING (public.is_any_staff() OR private.manages_offering(offering_id));
DROP POLICY IF EXISTS "investors read their own commitment events" ON public.commitment_events;
CREATE POLICY "investors read their own commitment events" ON public.commitment_events
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.investor_positions p
    WHERE p.id = commitment_events.position_id AND p.investor_user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.protect_commitment_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Commitment history is append-only; record a correcting event instead.';
END;
$$;
DROP TRIGGER IF EXISTS commitment_events_append_only ON public.commitment_events;
CREATE TRIGGER commitment_events_append_only
  BEFORE UPDATE OR DELETE ON public.commitment_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_commitment_events();

CREATE TABLE IF NOT EXISTS public.allocation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  basis TEXT NOT NULL DEFAULT 'ownership_percentage' CHECK (basis IN (
    'ownership_percentage','contributed_capital','committed_capital','weighted_average_capital',
    'units','specific_allocation','class_series','time_weighted_participation','other')),
  methodology TEXT NOT NULL DEFAULT 'allocation-v1',
  methodology_note TEXT,
  time_weighted BOOLEAN NOT NULL DEFAULT false,
  spv_simple BOOLEAN NOT NULL DEFAULT false,
  manager_workflow TEXT NOT NULL DEFAULT 'acknowledge'
    CHECK (manager_workflow IN ('none','acknowledge','approve')),
  rounding TEXT NOT NULL DEFAULT 'largest_remainder',
  tolerance_cents BIGINT NOT NULL DEFAULT 0,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  documented_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS allocation_policies_offering_idx ON public.allocation_policies(offering_id, version);

GRANT SELECT ON public.allocation_policies TO authenticated;
GRANT ALL ON public.allocation_policies TO service_role;
ALTER TABLE public.allocation_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read allocation policies" ON public.allocation_policies;
CREATE POLICY "staff read allocation policies" ON public.allocation_policies
  FOR SELECT TO authenticated USING (public.is_any_staff() OR private.manages_offering(offering_id));

CREATE TABLE IF NOT EXISTS public.management_fee_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.investor_classes(id) ON DELETE CASCADE,
  position_id UUID REFERENCES public.investor_positions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  basis TEXT NOT NULL DEFAULT 'committed_capital' CHECK (basis IN (
    'committed_capital','invested_capital','net_asset_value','cost_basis','flat','other')),
  rate_bps INTEGER NOT NULL DEFAULT 0,
  flat_amount_cents BIGINT NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL DEFAULT 'quarterly'
    CHECK (frequency IN ('monthly','quarterly','semi_annually','annually','one_time')),
  starts_on DATE NOT NULL,
  ends_on DATE,
  step_downs JSONB NOT NULL DEFAULT '[]'::jsonb,
  waiver_bps INTEGER NOT NULL DEFAULT 0,
  offset_pct NUMERIC(9,6) NOT NULL DEFAULT 0,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS management_fee_terms_offering_idx ON public.management_fee_terms(offering_id, starts_on);

GRANT SELECT ON public.management_fee_terms TO authenticated;
GRANT ALL ON public.management_fee_terms TO service_role;
ALTER TABLE public.management_fee_terms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read fee terms" ON public.management_fee_terms;
CREATE POLICY "staff read fee terms" ON public.management_fee_terms
  FOR SELECT TO authenticated USING (public.is_any_staff() OR private.manages_offering(offering_id));

CREATE TABLE IF NOT EXISTS public.waterfall_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.investor_classes(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  structure TEXT NOT NULL DEFAULT 'none' CHECK (structure IN (
    'none','spv_simple','european_whole_fund','american_deal_by_deal','tiered','other')),
  preferred_return_bps INTEGER NOT NULL DEFAULT 0,
  compounding TEXT NOT NULL DEFAULT 'annual'
    CHECK (compounding IN ('none','simple','annual','quarterly')),
  catch_up_pct NUMERIC(9,6) NOT NULL DEFAULT 0,
  carry_pct NUMERIC(9,6) NOT NULL DEFAULT 0,
  return_of_capital_first BOOLEAN NOT NULL DEFAULT true,
  clawback_tracked BOOLEAN NOT NULL DEFAULT true,
  tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  effective_from DATE NOT NULL,
  effective_to DATE,
  documented_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS waterfall_terms_offering_idx ON public.waterfall_terms(offering_id, version);

GRANT SELECT ON public.waterfall_terms TO authenticated;
GRANT ALL ON public.waterfall_terms TO service_role;
ALTER TABLE public.waterfall_terms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read waterfall terms" ON public.waterfall_terms;
CREATE POLICY "staff read waterfall terms" ON public.waterfall_terms
  FOR SELECT TO authenticated USING (public.is_any_staff() OR private.manages_offering(offering_id));

CREATE TABLE IF NOT EXISTS public.allocation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  book_id UUID REFERENCES public.ledger_books(id) ON DELETE SET NULL,
  period_id UUID REFERENCES public.accounting_periods(id) ON DELETE SET NULL,
  nav_version_id UUID REFERENCES public.nav_versions(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES public.allocation_policies(id) ON DELETE SET NULL,
  policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  source_cutoff_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','calculating','review','manager_review','approved','finalized','superseded')),
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id UUID REFERENCES public.allocation_runs(id) ON DELETE SET NULL,
  fund_totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  allocated_totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  reconciliation JSONB NOT NULL DEFAULT '{}'::jsonb,
  difference_cents BIGINT NOT NULL DEFAULT 0,
  inputs_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  prepared_by UUID,
  prepared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  finalized_by UUID,
  finalized_at TIMESTAMPTZ,
  manager_response TEXT,
  manager_note TEXT,
  manager_responded_by UUID,
  manager_responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS allocation_runs_offering_idx ON public.allocation_runs(offering_id, period_end);
CREATE UNIQUE INDEX IF NOT EXISTS allocation_runs_one_final_idx
  ON public.allocation_runs(offering_id, period_end) WHERE status = 'finalized';

GRANT SELECT ON public.allocation_runs TO authenticated;
GRANT ALL ON public.allocation_runs TO service_role;
ALTER TABLE public.allocation_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read allocation runs" ON public.allocation_runs;
CREATE POLICY "staff read allocation runs" ON public.allocation_runs
  FOR SELECT TO authenticated USING (public.is_any_staff() OR private.manages_offering(offering_id));

CREATE OR REPLACE FUNCTION public.protect_finalized_allocation_run()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('finalized','superseded') THEN
      RAISE EXCEPTION 'A finalized allocation run cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'finalized' AND NEW.status NOT IN ('finalized','superseded') THEN
    RAISE EXCEPTION 'A finalized allocation run cannot be reopened; produce a revision.';
  END IF;
  IF OLD.status IN ('finalized','superseded') AND (
        NEW.fund_totals IS DISTINCT FROM OLD.fund_totals
     OR NEW.allocated_totals IS DISTINCT FROM OLD.allocated_totals
     OR NEW.reconciliation IS DISTINCT FROM OLD.reconciliation
     OR NEW.difference_cents IS DISTINCT FROM OLD.difference_cents
     OR NEW.inputs_snapshot IS DISTINCT FROM OLD.inputs_snapshot
     OR NEW.policy_snapshot IS DISTINCT FROM OLD.policy_snapshot
     OR NEW.nav_version_id IS DISTINCT FROM OLD.nav_version_id) THEN
    RAISE EXCEPTION 'Finalized allocation figures are immutable.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS allocation_runs_protect ON public.allocation_runs;
CREATE TRIGGER allocation_runs_protect
  BEFORE UPDATE OR DELETE ON public.allocation_runs
  FOR EACH ROW EXECUTE FUNCTION public.protect_finalized_allocation_run();

CREATE TABLE IF NOT EXISTS public.allocation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.allocation_runs(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  position_id UUID NOT NULL REFERENCES public.investor_positions(id) ON DELETE RESTRICT,
  class_id UUID REFERENCES public.investor_classes(id) ON DELETE SET NULL,
  basis TEXT NOT NULL,
  basis_amount_cents BIGINT NOT NULL DEFAULT 0,
  weight NUMERIC(18,12) NOT NULL DEFAULT 0,
  ownership_pct NUMERIC(12,8),
  days_in_period INTEGER,
  beginning_capital_cents BIGINT NOT NULL DEFAULT 0,
  contributions_cents BIGINT NOT NULL DEFAULT 0,
  allocated_income_cents BIGINT NOT NULL DEFAULT 0,
  realized_gain_cents BIGINT NOT NULL DEFAULT 0,
  unrealized_gain_cents BIGINT NOT NULL DEFAULT 0,
  allocated_loss_cents BIGINT NOT NULL DEFAULT 0,
  fund_expenses_cents BIGINT NOT NULL DEFAULT 0,
  management_fees_cents BIGINT NOT NULL DEFAULT 0,
  carried_interest_cents BIGINT NOT NULL DEFAULT 0,
  distributions_cents BIGINT NOT NULL DEFAULT 0,
  other_adjustments_cents BIGINT NOT NULL DEFAULT 0,
  ending_capital_cents BIGINT NOT NULL DEFAULT 0,
  commitment_cents BIGINT NOT NULL DEFAULT 0,
  contributed_to_date_cents BIGINT NOT NULL DEFAULT 0,
  unfunded_commitment_cents BIGINT NOT NULL DEFAULT 0,
  units NUMERIC(24,8),
  tax_allocations JSONB NOT NULL DEFAULT '{}'::jsonb,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS allocation_lines_unique_idx ON public.allocation_lines(run_id, position_id);
CREATE INDEX IF NOT EXISTS allocation_lines_position_idx ON public.allocation_lines(position_id);

GRANT SELECT ON public.allocation_lines TO authenticated;
GRANT ALL ON public.allocation_lines TO service_role;
ALTER TABLE public.allocation_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read allocation lines" ON public.allocation_lines;
CREATE POLICY "staff read allocation lines" ON public.allocation_lines
  FOR SELECT TO authenticated USING (public.is_any_staff() OR private.manages_offering(offering_id));
DROP POLICY IF EXISTS "investors read their own allocation lines" ON public.allocation_lines;
CREATE POLICY "investors read their own allocation lines" ON public.allocation_lines
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.investor_positions p
    WHERE p.id = allocation_lines.position_id AND p.investor_user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.fee_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.allocation_runs(id) ON DELETE CASCADE,
  position_id UUID REFERENCES public.investor_positions(id) ON DELETE CASCADE,
  term_id UUID REFERENCES public.management_fee_terms(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  basis TEXT NOT NULL,
  basis_amount_cents BIGINT NOT NULL DEFAULT 0,
  rate_bps INTEGER NOT NULL DEFAULT 0,
  gross_fee_cents BIGINT NOT NULL DEFAULT 0,
  waiver_cents BIGINT NOT NULL DEFAULT 0,
  offset_cents BIGINT NOT NULL DEFAULT 0,
  net_fee_cents BIGINT NOT NULL DEFAULT 0,
  ledger_fee_cents BIGINT,
  reconciled BOOLEAN NOT NULL DEFAULT false,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fee_calculations_run_idx ON public.fee_calculations(run_id);

GRANT SELECT ON public.fee_calculations TO authenticated;
GRANT ALL ON public.fee_calculations TO service_role;
ALTER TABLE public.fee_calculations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read fee calculations" ON public.fee_calculations;
CREATE POLICY "staff read fee calculations" ON public.fee_calculations
  FOR SELECT TO authenticated USING (public.is_any_staff() OR private.manages_offering(offering_id));

CREATE TABLE IF NOT EXISTS public.carry_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.allocation_runs(id) ON DELETE CASCADE,
  position_id UUID REFERENCES public.investor_positions(id) ON DELETE CASCADE,
  terms_id UUID REFERENCES public.waterfall_terms(id) ON DELETE SET NULL,
  tier TEXT,
  amount_cents BIGINT NOT NULL DEFAULT 0,
  clawback_cents BIGINT NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'approved_waterfall',
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS carry_allocations_run_idx ON public.carry_allocations(run_id);

GRANT SELECT ON public.carry_allocations TO authenticated;
GRANT ALL ON public.carry_allocations TO service_role;
ALTER TABLE public.carry_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read carry allocations" ON public.carry_allocations;
CREATE POLICY "staff read carry allocations" ON public.carry_allocations
  FOR SELECT TO authenticated USING (public.is_any_staff() OR private.manages_offering(offering_id));

CREATE TABLE IF NOT EXISTS public.capital_account_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  position_id UUID NOT NULL REFERENCES public.investor_positions(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.allocation_runs(id) ON DELETE SET NULL,
  classification TEXT NOT NULL CHECK (classification IN (
    'correction','rebalance','expense_reallocation','fee_adjustment','carry_adjustment',
    'transfer_adjustment','tax_adjustment','other')),
  amount_cents BIGINT NOT NULL,
  effective_date DATE NOT NULL,
  reason TEXT NOT NULL,
  evidence_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','applied')),
  requested_by UUID,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS capital_account_adjustments_offering_idx
  ON public.capital_account_adjustments(offering_id, status);

GRANT SELECT ON public.capital_account_adjustments TO authenticated;
GRANT ALL ON public.capital_account_adjustments TO service_role;
ALTER TABLE public.capital_account_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read capital adjustments" ON public.capital_account_adjustments;
CREATE POLICY "staff read capital adjustments" ON public.capital_account_adjustments
  FOR SELECT TO authenticated USING (public.is_any_staff() OR private.manages_offering(offering_id));

CREATE TABLE IF NOT EXISTS public.position_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  from_position_id UUID NOT NULL REFERENCES public.investor_positions(id) ON DELETE RESTRICT,
  to_position_id UUID NOT NULL REFERENCES public.investor_positions(id) ON DELETE RESTRICT,
  effective_date DATE NOT NULL,
  capital_cents BIGINT NOT NULL DEFAULT 0,
  commitment_cents BIGINT NOT NULL DEFAULT 0,
  units NUMERIC(24,8),
  tax_basis_reference TEXT,
  authorization_reference TEXT NOT NULL,
  authorization_document_path TEXT,
  status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','reversed')),
  recorded_by UUID,
  approved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS position_transfers_offering_idx ON public.position_transfers(offering_id, effective_date);

GRANT SELECT ON public.position_transfers TO authenticated;
GRANT ALL ON public.position_transfers TO service_role;
ALTER TABLE public.position_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read position transfers" ON public.position_transfers;
CREATE POLICY "staff read position transfers" ON public.position_transfers
  FOR SELECT TO authenticated USING (public.is_any_staff() OR private.manages_offering(offering_id));

CREATE TABLE IF NOT EXISTS public.investor_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  position_id UUID NOT NULL REFERENCES public.investor_positions(id) ON DELETE RESTRICT,
  run_id UUID REFERENCES public.allocation_runs(id) ON DELETE SET NULL,
  capital_account_id UUID REFERENCES public.capital_accounts(id) ON DELETE SET NULL,
  report_id UUID REFERENCES public.financial_reports(id) ON DELETE SET NULL,
  investor_user_id UUID,
  investment_profile_id UUID REFERENCES public.investment_profiles(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','review','approved','published','superseded')),
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id UUID REFERENCES public.investor_statements(id) ON DELETE SET NULL,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  prepared_by UUID,
  prepared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  published_by UUID,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS investor_statements_position_idx ON public.investor_statements(position_id, period_end);
CREATE UNIQUE INDEX IF NOT EXISTS investor_statements_one_published_idx
  ON public.investor_statements(position_id, period_end) WHERE status = 'published';

GRANT SELECT ON public.investor_statements TO authenticated;
GRANT ALL ON public.investor_statements TO service_role;
ALTER TABLE public.investor_statements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read investor statements" ON public.investor_statements;
CREATE POLICY "staff read investor statements" ON public.investor_statements
  FOR SELECT TO authenticated USING (public.is_any_staff() OR private.manages_offering(offering_id));
DROP POLICY IF EXISTS "investors read their own published statements" ON public.investor_statements;
CREATE POLICY "investors read their own published statements" ON public.investor_statements
  FOR SELECT TO authenticated USING (
    status IN ('published','superseded')
    AND EXISTS (SELECT 1 FROM public.investor_positions p
                WHERE p.id = investor_statements.position_id AND p.investor_user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.protect_published_investor_statement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published','superseded') THEN
      RAISE EXCEPTION 'A published statement cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('published','superseded') THEN
    IF NEW.snapshot IS DISTINCT FROM OLD.snapshot
       OR NEW.provenance IS DISTINCT FROM OLD.provenance
       OR NEW.period_start IS DISTINCT FROM OLD.period_start
       OR NEW.period_end IS DISTINCT FROM OLD.period_end
       OR NEW.position_id IS DISTINCT FROM OLD.position_id
       OR NEW.version IS DISTINCT FROM OLD.version THEN
      RAISE EXCEPTION 'A published statement is immutable; issue a revised version instead.';
    END IF;
    IF OLD.status = 'published' AND NEW.status NOT IN ('published','superseded') THEN
      RAISE EXCEPTION 'A published statement cannot return to an earlier status.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS investor_statements_protect ON public.investor_statements;
CREATE TRIGGER investor_statements_protect
  BEFORE UPDATE OR DELETE ON public.investor_statements
  FOR EACH ROW EXECUTE FUNCTION public.protect_published_investor_statement();

CREATE TABLE IF NOT EXISTS public.allocation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID REFERENCES public.offerings(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.allocation_runs(id) ON DELETE SET NULL,
  position_id UUID REFERENCES public.investor_positions(id) ON DELETE SET NULL,
  statement_id UUID REFERENCES public.investor_statements(id) ON DELETE SET NULL,
  actor_user_id UUID,
  actor_role TEXT NOT NULL DEFAULT 'harmonious',
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  reason TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS allocation_events_offering_idx ON public.allocation_events(offering_id, created_at);

GRANT SELECT ON public.allocation_events TO authenticated;
GRANT ALL ON public.allocation_events TO service_role;
ALTER TABLE public.allocation_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read allocation events" ON public.allocation_events;
CREATE POLICY "staff read allocation events" ON public.allocation_events
  FOR SELECT TO authenticated USING (public.is_any_staff() OR private.manages_offering(offering_id));

CREATE OR REPLACE FUNCTION public.protect_allocation_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Allocation audit events are append-only.';
END;
$$;
DROP TRIGGER IF EXISTS allocation_events_append_only ON public.allocation_events;
CREATE TRIGGER allocation_events_append_only
  BEFORE UPDATE OR DELETE ON public.allocation_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_allocation_events();

ALTER TABLE public.capital_accounts
  ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES public.investor_positions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS allocation_run_id UUID REFERENCES public.allocation_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES public.investor_classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS realized_gain_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unrealized_gain_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS management_fees_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fund_expenses_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carried_interest_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contributed_to_date_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distributions_to_date_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS units NUMERIC(24,8),
  ADD COLUMN IF NOT EXISTS tax_allocations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finalized_by UUID;

CREATE INDEX IF NOT EXISTS capital_accounts_position_idx ON public.capital_accounts(position_id, period_end);

CREATE OR REPLACE FUNCTION public.protect_finalized_capital_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.finalized_at IS NOT NULL THEN
      RAISE EXCEPTION 'A finalized capital account cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.finalized_at IS NOT NULL AND (
       NEW.beginning_capital_cents IS DISTINCT FROM OLD.beginning_capital_cents
    OR NEW.contributions_cents IS DISTINCT FROM OLD.contributions_cents
    OR NEW.allocated_income_cents IS DISTINCT FROM OLD.allocated_income_cents
    OR NEW.allocated_loss_cents IS DISTINCT FROM OLD.allocated_loss_cents
    OR NEW.distributions_cents IS DISTINCT FROM OLD.distributions_cents
    OR NEW.realized_gain_cents IS DISTINCT FROM OLD.realized_gain_cents
    OR NEW.unrealized_gain_cents IS DISTINCT FROM OLD.unrealized_gain_cents
    OR NEW.management_fees_cents IS DISTINCT FROM OLD.management_fees_cents
    OR NEW.fund_expenses_cents IS DISTINCT FROM OLD.fund_expenses_cents
    OR NEW.carried_interest_cents IS DISTINCT FROM OLD.carried_interest_cents
    OR NEW.other_adjustments_cents IS DISTINCT FROM OLD.other_adjustments_cents
    OR NEW.ending_capital_cents IS DISTINCT FROM OLD.ending_capital_cents) THEN
    RAISE EXCEPTION 'A finalized capital account is immutable; produce a new version.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS capital_accounts_protect_finalized ON public.capital_accounts;
CREATE TRIGGER capital_accounts_protect_finalized
  BEFORE UPDATE OR DELETE ON public.capital_accounts
  FOR EACH ROW EXECUTE FUNCTION public.protect_finalized_capital_account();

DROP POLICY IF EXISTS "investors read their own capital accounts" ON public.capital_accounts;
CREATE POLICY "investors read their own capital accounts" ON public.capital_accounts
  FOR SELECT TO authenticated USING (
    investor_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.investor_positions p
               WHERE p.id = capital_accounts.position_id AND p.investor_user_id = auth.uid()));