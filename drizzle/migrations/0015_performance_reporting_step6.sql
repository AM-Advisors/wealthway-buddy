-- Step 6: fund and investor performance reporting engine.
-- Additive only. Nothing existing is dropped or renamed.

-- ------------------------------------------------ methodology registry
CREATE TABLE public.performance_methodologies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES public.ledger_books(id) ON DELETE CASCADE,
  offering_id UUID REFERENCES public.offerings(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  label TEXT NOT NULL,
  fund_type TEXT NOT NULL DEFAULT 'spv',
  calculation_method TEXT NOT NULL DEFAULT 'capital_flows',
  metrics TEXT[] NOT NULL DEFAULT '{}',
  fee_treatment JSONB NOT NULL DEFAULT '{}'::jsonb,
  carry_treatment JSONB NOT NULL DEFAULT '{}'::jsonb,
  expense_treatment JSONB NOT NULL DEFAULT '{}'::jsonb,
  cash_flow_timing TEXT NOT NULL DEFAULT 'actual_dated',
  annualization TEXT NOT NULL DEFAULT 'annualize_over_one_year',
  rounding TEXT NOT NULL DEFAULT 'basis_points',
  benchmark_methodology JSONB NOT NULL DEFAULT '{}'::jsonb,
  capital_definition TEXT NOT NULL DEFAULT 'paid_in',
  exception_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX performance_methodologies_offering_idx
  ON public.performance_methodologies (offering_id, version DESC);

GRANT SELECT ON public.performance_methodologies TO authenticated;
GRANT ALL ON public.performance_methodologies TO service_role;
ALTER TABLE public.performance_methodologies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read performance methodologies" ON public.performance_methodologies
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "managers read their performance methodologies" ON public.performance_methodologies
  FOR SELECT TO authenticated
  USING (offering_id IS NOT NULL AND private.manages_offering(offering_id));

-- ------------------------------------------------ per-fund configuration
CREATE TABLE public.performance_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL UNIQUE REFERENCES public.offerings(id) ON DELETE CASCADE,
  book_id UUID REFERENCES public.ledger_books(id) ON DELETE SET NULL,
  fund_type TEXT NOT NULL DEFAULT 'spv',
  methodology_id UUID REFERENCES public.performance_methodologies(id) ON DELETE SET NULL,
  enabled_metrics TEXT[] NOT NULL DEFAULT '{}',
  default_frequency TEXT NOT NULL DEFAULT 'quarter',
  manager_response_enabled BOOLEAN NOT NULL DEFAULT true,
  investor_reporting_enabled BOOLEAN NOT NULL DEFAULT true,
  blocking_exception_kinds TEXT[] NOT NULL DEFAULT '{}',
  large_movement_threshold_bps INTEGER NOT NULL DEFAULT 5000,
  notes TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.performance_configs TO authenticated;
GRANT ALL ON public.performance_configs TO service_role;
ALTER TABLE public.performance_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read performance configs" ON public.performance_configs
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "managers read their performance configs" ON public.performance_configs
  FOR SELECT TO authenticated USING (private.manages_offering(offering_id));

-- ------------------------------------------------ fund-level runs
CREATE TABLE public.performance_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES public.ledger_books(id) ON DELETE SET NULL,
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  period_kind TEXT NOT NULL DEFAULT 'quarter'
    CHECK (period_kind IN ('month','quarter','year','year_to_date','inception_to_date','custom')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_label TEXT NOT NULL DEFAULT '',
  source_cutoff_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status public.report_status NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id UUID REFERENCES public.performance_runs(id) ON DELETE SET NULL,
  superseded_by_id UUID REFERENCES public.performance_runs(id) ON DELETE SET NULL,
  revision_reason TEXT,
  fund_type TEXT NOT NULL DEFAULT 'spv',
  methodology_id UUID REFERENCES public.performance_methodologies(id) ON DELETE SET NULL,
  methodology_version TEXT NOT NULL DEFAULT 'perf-v1',
  methodology_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  nav_version_id UUID REFERENCES public.nav_versions(id) ON DELETE SET NULL,
  beginning_nav_version_id UUID REFERENCES public.nav_versions(id) ON DELETE SET NULL,
  allocation_run_id UUID REFERENCES public.allocation_runs(id) ON DELETE SET NULL,
  prior_run_id UUID REFERENCES public.performance_runs(id) ON DELETE SET NULL,
  beginning_value_cents BIGINT NOT NULL DEFAULT 0,
  ending_value_cents BIGINT NOT NULL DEFAULT 0,
  contributions_cents BIGINT NOT NULL DEFAULT 0,
  distributions_cents BIGINT NOT NULL DEFAULT 0,
  investment_income_cents BIGINT NOT NULL DEFAULT 0,
  realized_gain_cents BIGINT NOT NULL DEFAULT 0,
  unrealized_gain_cents BIGINT NOT NULL DEFAULT 0,
  expenses_cents BIGINT NOT NULL DEFAULT 0,
  management_fees_cents BIGINT NOT NULL DEFAULT 0,
  carried_interest_cents BIGINT NOT NULL DEFAULT 0,
  paid_in_capital_cents BIGINT NOT NULL DEFAULT 0,
  unfunded_commitment_cents BIGINT NOT NULL DEFAULT 0,
  realized_value_cents BIGINT NOT NULL DEFAULT 0,
  remaining_value_cents BIGINT NOT NULL DEFAULT 0,
  total_value_cents BIGINT NOT NULL DEFAULT 0,
  gross_return_bps INTEGER,
  net_return_bps INTEGER,
  irr_bps INTEGER,
  irr_status TEXT NOT NULL DEFAULT 'not_calculated',
  twr_bps INTEGER,
  twr_status TEXT NOT NULL DEFAULT 'not_calculated',
  cumulative_return_bps INTEGER,
  moic NUMERIC,
  dpi NUMERIC,
  rvpi NUMERIC,
  tvpi NUMERIC,
  bridge JSONB NOT NULL DEFAULT '{}'::jsonb,
  cash_flows JSONB NOT NULL DEFAULT '[]'::jsonb,
  subperiods JSONB NOT NULL DEFAULT '[]'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  inputs_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  overrides JSONB NOT NULL DEFAULT '[]'::jsonb,
  benchmarks JSONB NOT NULL DEFAULT '[]'::jsonb,
  manager_visible BOOLEAN NOT NULL DEFAULT false,
  investor_visible BOOLEAN NOT NULL DEFAULT false,
  manager_response TEXT,
  manager_note TEXT,
  manager_responded_by UUID,
  manager_responded_at TIMESTAMPTZ,
  prepared_by UUID,
  prepared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  published_by UUID,
  published_at TIMESTAMPTZ,
  report_id UUID REFERENCES public.financial_reports(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX performance_runs_offering_idx
  ON public.performance_runs (offering_id, period_end DESC, version DESC);
CREATE UNIQUE INDEX performance_runs_one_published_idx
  ON public.performance_runs (offering_id, period_kind, period_start, period_end)
  WHERE status = 'published';

GRANT SELECT ON public.performance_runs TO authenticated;
GRANT ALL ON public.performance_runs TO service_role;
ALTER TABLE public.performance_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read performance runs" ON public.performance_runs
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "managers read published performance" ON public.performance_runs
  FOR SELECT TO authenticated
  USING (
    private.manages_offering(offering_id)
    AND manager_visible
    AND status IN ('published','superseded')
  );

-- ------------------------------------------------ investor-level lines
CREATE TABLE public.performance_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.performance_runs(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  position_id UUID REFERENCES public.investor_positions(id) ON DELETE SET NULL,
  investment_profile_id UUID REFERENCES public.investment_profiles(id) ON DELETE SET NULL,
  investor_user_id UUID,
  capital_account_id UUID REFERENCES public.capital_accounts(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL DEFAULT '',
  capacity TEXT NOT NULL DEFAULT 'individual',
  is_gp BOOLEAN NOT NULL DEFAULT false,
  beginning_capital_cents BIGINT NOT NULL DEFAULT 0,
  contributions_cents BIGINT NOT NULL DEFAULT 0,
  distributions_cents BIGINT NOT NULL DEFAULT 0,
  allocated_income_cents BIGINT NOT NULL DEFAULT 0,
  realized_gain_cents BIGINT NOT NULL DEFAULT 0,
  unrealized_gain_cents BIGINT NOT NULL DEFAULT 0,
  fees_cents BIGINT NOT NULL DEFAULT 0,
  expenses_cents BIGINT NOT NULL DEFAULT 0,
  carry_cents BIGINT NOT NULL DEFAULT 0,
  ending_capital_cents BIGINT NOT NULL DEFAULT 0,
  paid_in_capital_cents BIGINT NOT NULL DEFAULT 0,
  commitment_cents BIGINT NOT NULL DEFAULT 0,
  unfunded_commitment_cents BIGINT NOT NULL DEFAULT 0,
  realized_value_cents BIGINT NOT NULL DEFAULT 0,
  remaining_value_cents BIGINT NOT NULL DEFAULT 0,
  total_value_cents BIGINT NOT NULL DEFAULT 0,
  gross_return_bps INTEGER,
  net_return_bps INTEGER,
  irr_bps INTEGER,
  irr_status TEXT NOT NULL DEFAULT 'not_calculated',
  twr_bps INTEGER,
  twr_status TEXT NOT NULL DEFAULT 'not_calculated',
  moic NUMERIC,
  dpi NUMERIC,
  rvpi NUMERIC,
  tvpi NUMERIC,
  cash_flows JSONB NOT NULL DEFAULT '[]'::jsonb,
  bridge JSONB NOT NULL DEFAULT '{}'::jsonb,
  exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX performance_lines_unique_idx ON public.performance_lines (run_id, position_id);
CREATE INDEX performance_lines_investor_idx ON public.performance_lines (investor_user_id);
CREATE INDEX performance_lines_profile_idx ON public.performance_lines (investment_profile_id);

GRANT SELECT ON public.performance_lines TO authenticated;
GRANT ALL ON public.performance_lines TO service_role;
ALTER TABLE public.performance_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read performance lines" ON public.performance_lines
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "managers read published performance lines" ON public.performance_lines
  FOR SELECT TO authenticated
  USING (
    private.manages_offering(offering_id)
    AND EXISTS (
      SELECT 1 FROM public.performance_runs r
      WHERE r.id = run_id AND r.manager_visible AND r.status IN ('published','superseded')
    )
  );
CREATE POLICY "investors read their own performance lines" ON public.performance_lines
  FOR SELECT TO authenticated
  USING (
    investor_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.performance_runs r
      WHERE r.id = run_id AND r.investor_visible AND r.status IN ('published','superseded')
    )
  );

-- ------------------------------------------------ optional benchmarks
CREATE TABLE public.performance_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID REFERENCES public.offerings(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.performance_runs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  methodology TEXT NOT NULL DEFAULT '',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  return_bps INTEGER,
  value_status TEXT NOT NULL DEFAULT 'provided'
    CHECK (value_status IN ('provided','unavailable','stale')),
  as_of TIMESTAMPTZ,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX performance_benchmarks_offering_idx
  ON public.performance_benchmarks (offering_id, period_end DESC);
GRANT SELECT ON public.performance_benchmarks TO authenticated;
GRANT ALL ON public.performance_benchmarks TO service_role;
ALTER TABLE public.performance_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read benchmarks" ON public.performance_benchmarks
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "managers read their benchmarks" ON public.performance_benchmarks
  FOR SELECT TO authenticated
  USING (offering_id IS NOT NULL AND private.manages_offering(offering_id));

-- ------------------------------------------------ append-only audit trail
CREATE TABLE public.performance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.performance_runs(id) ON DELETE CASCADE,
  offering_id UUID,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_id UUID,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX performance_events_run_idx ON public.performance_events (run_id, created_at);
GRANT SELECT ON public.performance_events TO authenticated;
GRANT ALL ON public.performance_events TO service_role;
ALTER TABLE public.performance_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read performance events" ON public.performance_events
  FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE OR REPLACE FUNCTION public.protect_performance_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Performance events are append-only.';
END;
$$;
CREATE TRIGGER performance_events_append_only
  BEFORE UPDATE OR DELETE ON public.performance_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_performance_events();

-- ------------------------------------------------ immutability guards
CREATE OR REPLACE FUNCTION public.protect_published_performance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published','superseded') THEN
      RAISE EXCEPTION 'A published performance report cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'published' THEN
    IF NEW.status NOT IN ('published','superseded') THEN
      RAISE EXCEPTION 'A published performance report cannot return to %.', NEW.status;
    END IF;
    IF NEW.beginning_value_cents IS DISTINCT FROM OLD.beginning_value_cents
      OR NEW.ending_value_cents IS DISTINCT FROM OLD.ending_value_cents
      OR NEW.contributions_cents IS DISTINCT FROM OLD.contributions_cents
      OR NEW.distributions_cents IS DISTINCT FROM OLD.distributions_cents
      OR NEW.realized_gain_cents IS DISTINCT FROM OLD.realized_gain_cents
      OR NEW.unrealized_gain_cents IS DISTINCT FROM OLD.unrealized_gain_cents
      OR NEW.management_fees_cents IS DISTINCT FROM OLD.management_fees_cents
      OR NEW.carried_interest_cents IS DISTINCT FROM OLD.carried_interest_cents
      OR NEW.expenses_cents IS DISTINCT FROM OLD.expenses_cents
      OR NEW.gross_return_bps IS DISTINCT FROM OLD.gross_return_bps
      OR NEW.net_return_bps IS DISTINCT FROM OLD.net_return_bps
      OR NEW.irr_bps IS DISTINCT FROM OLD.irr_bps
      OR NEW.twr_bps IS DISTINCT FROM OLD.twr_bps
      OR NEW.moic IS DISTINCT FROM OLD.moic
      OR NEW.dpi IS DISTINCT FROM OLD.dpi
      OR NEW.rvpi IS DISTINCT FROM OLD.rvpi
      OR NEW.tvpi IS DISTINCT FROM OLD.tvpi
      OR NEW.bridge::text IS DISTINCT FROM OLD.bridge::text
      OR NEW.cash_flows::text IS DISTINCT FROM OLD.cash_flows::text
      OR NEW.methodology_snapshot::text IS DISTINCT FROM OLD.methodology_snapshot::text
      OR NEW.inputs_snapshot::text IS DISTINCT FROM OLD.inputs_snapshot::text
      OR NEW.nav_version_id IS DISTINCT FROM OLD.nav_version_id
      OR NEW.allocation_run_id IS DISTINCT FROM OLD.allocation_run_id
      OR NEW.period_start IS DISTINCT FROM OLD.period_start
      OR NEW.period_end IS DISTINCT FROM OLD.period_end
      OR NEW.version IS DISTINCT FROM OLD.version
    THEN
      RAISE EXCEPTION 'A published performance report is immutable; issue a superseding version.';
    END IF;
  END IF;

  IF OLD.status = 'superseded' AND NEW.status <> 'superseded' THEN
    RAISE EXCEPTION 'A superseded performance report cannot be reopened.';
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER performance_runs_immutable
  BEFORE UPDATE OR DELETE ON public.performance_runs
  FOR EACH ROW EXECUTE FUNCTION public.protect_published_performance();

CREATE OR REPLACE FUNCTION public.protect_published_performance_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  run_status public.report_status;
BEGIN
  SELECT status INTO run_status FROM public.performance_runs
  WHERE id = COALESCE(NEW.run_id, OLD.run_id);
  IF run_status IN ('published','superseded') THEN
    RAISE EXCEPTION 'Investor performance for a published report cannot be changed.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER performance_lines_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.performance_lines
  FOR EACH ROW EXECUTE FUNCTION public.protect_published_performance_lines();

CREATE TRIGGER performance_runs_set_updated_at
  BEFORE UPDATE ON public.performance_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER performance_methodologies_set_updated_at
  BEFORE UPDATE ON public.performance_methodologies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER performance_configs_set_updated_at
  BEFORE UPDATE ON public.performance_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
