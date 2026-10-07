-- 1. Payout economic (sent/effective) date, separate from created/approved/posted/reconciled timestamps.
ALTER TABLE public.distribution_payments ADD COLUMN IF NOT EXISTS sent_on date;
COMMENT ON COLUMN public.distribution_payments.sent_on IS 'Economic payment/sent date chosen by staff; drives matching window and distribution dating. Changes logged in distribution_payment_date_changes.';

CREATE TABLE public.distribution_payment_date_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.distribution_payments(id),
  previous_sent_on date,
  new_sent_on date NOT NULL,
  reason text NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.distribution_payment_date_changes TO service_role;
ALTER TABLE public.distribution_payment_date_changes ENABLE ROW LEVEL SECURITY;

-- 2. Financial pilot (parallel mode). Service-role only; reached through staff-gated server functions.
CREATE TABLE public.financial_pilots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  status text NOT NULL DEFAULT 'evaluating' CHECK (status IN ('evaluating','selected','opening_data','parallel_active','parallel_closed','parallel_passed','continue_parallel','requires_remediation','cutover_approved','withdrawn')),
  mode text NOT NULL DEFAULT 'parallel' CHECK (mode = 'parallel'),
  authoritative_source text NOT NULL DEFAULT 'existing_process' CHECK (authoritative_source = 'existing_process'),
  period_label text,
  period_start date,
  period_end date,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX financial_pilots_one_live_per_fund ON public.financial_pilots(offering_id) WHERE status <> 'withdrawn';
COMMENT ON TABLE public.financial_pilots IS 'Parallel pilot only: the existing accounting process stays authoritative; cutover_approved records a decision, never an automatic cutover.';

CREATE TABLE public.financial_pilot_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid REFERENCES public.financial_pilots(id),
  offering_id uuid NOT NULL,
  event text NOT NULL,
  from_status text,
  to_status text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.financial_pilot_candidate_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  factors jsonb NOT NULL,
  total_score integer NOT NULL,
  disqualifiers text[] NOT NULL DEFAULT '{}',
  note text,
  scored_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.financial_pilot_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES public.financial_pilots(id),
  role_key text NOT NULL CHECK (role_key IN ('primary_administrator','accounting_lead','relationship_lead','accounting_preparer','accounting_reviewer','nav_reviewer','allocation_reviewer','distribution_reviewer','finance_payout','close_reviewer')),
  user_id uuid NOT NULL,
  assigned_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.financial_pilot_opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES public.financial_pilots(id),
  category text NOT NULL CHECK (category IN ('trial_balance_debits','trial_balance_credits','cash','investments_cost','investments_fair_value','commitments','called_capital','uncalled_capital','investor_capital','liabilities','accrued_expenses','management_fee_balance','prior_distributions','nav_equity','other')),
  label text,
  position_id uuid,
  official_cents bigint NOT NULL,
  source_document text NOT NULL,
  entered_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.financial_pilot_variances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES public.financial_pilots(id),
  kind text NOT NULL DEFAULT 'variance' CHECK (kind IN ('variance','migration_exception')),
  period_label text NOT NULL,
  metric text NOT NULL,
  position_id uuid,
  component text,
  official_cents bigint NOT NULL,
  harmonious_cents bigint NOT NULL,
  variance_cents bigint GENERATED ALWAYS AS (harmonious_cents - official_cents) STORED,
  materiality_cents bigint NOT NULL DEFAULT 0,
  structural boolean NOT NULL DEFAULT false,
  source text NOT NULL,
  cause text,
  classification text NOT NULL DEFAULT 'unknown' CHECK (classification IN ('data_migration','timing','accounting_policy','configuration','calculation_defect','workflow_defect','source_system_error','expected_difference','unknown')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','accepted')),
  owner_user_id uuid,
  resolution text,
  raised_by uuid NOT NULL,
  reviewer_user_id uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.financial_pilot_materiality (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES public.financial_pilots(id),
  metric text NOT NULL,
  tolerance_cents bigint NOT NULL CHECK (tolerance_cents >= 0),
  set_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.financial_pilot_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES public.financial_pilots(id),
  role_key text NOT NULL CHECK (role_key IN ('accounting_lead','operations_admin','finance_controller','leadership')),
  user_id uuid NOT NULL,
  confirmations jsonb NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pilot_id, role_key)
);

CREATE TABLE public.financial_pilot_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_id uuid NOT NULL REFERENCES public.financial_pilots(id),
  decision text NOT NULL CHECK (decision IN ('continue_parallel','approve_production_cutover','requires_remediation')),
  reason text NOT NULL,
  decided_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.financial_pilots, public.financial_pilot_events, public.financial_pilot_candidate_scores, public.financial_pilot_staff, public.financial_pilot_opening_balances, public.financial_pilot_variances, public.financial_pilot_materiality, public.financial_pilot_signoffs, public.financial_pilot_decisions TO service_role;
ALTER TABLE public.financial_pilots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_pilot_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_pilot_candidate_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_pilot_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_pilot_opening_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_pilot_variances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_pilot_materiality ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_pilot_signoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_pilot_decisions ENABLE ROW LEVEL SECURITY;

-- Append-only history tables.
CREATE OR REPLACE FUNCTION public.block_financial_pilot_history_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END $$;
CREATE TRIGGER fp_events_ao BEFORE UPDATE OR DELETE ON public.financial_pilot_events FOR EACH ROW EXECUTE FUNCTION public.block_financial_pilot_history_mutation();
CREATE TRIGGER fp_scores_ao BEFORE UPDATE OR DELETE ON public.financial_pilot_candidate_scores FOR EACH ROW EXECUTE FUNCTION public.block_financial_pilot_history_mutation();
CREATE TRIGGER fp_staff_ao BEFORE UPDATE OR DELETE ON public.financial_pilot_staff FOR EACH ROW EXECUTE FUNCTION public.block_financial_pilot_history_mutation();
CREATE TRIGGER fp_opening_ao BEFORE UPDATE OR DELETE ON public.financial_pilot_opening_balances FOR EACH ROW EXECUTE FUNCTION public.block_financial_pilot_history_mutation();
CREATE TRIGGER fp_materiality_ao BEFORE UPDATE OR DELETE ON public.financial_pilot_materiality FOR EACH ROW EXECUTE FUNCTION public.block_financial_pilot_history_mutation();
CREATE TRIGGER fp_signoffs_ao BEFORE UPDATE OR DELETE ON public.financial_pilot_signoffs FOR EACH ROW EXECUTE FUNCTION public.block_financial_pilot_history_mutation();
CREATE TRIGGER fp_decisions_ao BEFORE UPDATE OR DELETE ON public.financial_pilot_decisions FOR EACH ROW EXECUTE FUNCTION public.block_financial_pilot_history_mutation();
CREATE TRIGGER pdc_ao BEFORE UPDATE OR DELETE ON public.distribution_payment_date_changes FOR EACH ROW EXECUTE FUNCTION public.block_financial_pilot_history_mutation();

-- Variance values are frozen; only resolution fields may change, and never back to open after resolution.
CREATE OR REPLACE FUNCTION public.guard_financial_pilot_variance() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Pilot variances cannot be deleted'; END IF;
  IF NEW.official_cents <> OLD.official_cents OR NEW.harmonious_cents <> OLD.harmonious_cents OR NEW.metric <> OLD.metric
     OR NEW.period_label <> OLD.period_label OR NEW.pilot_id <> OLD.pilot_id OR NEW.kind <> OLD.kind OR NEW.raised_by <> OLD.raised_by
     OR NEW.position_id IS DISTINCT FROM OLD.position_id OR NEW.component IS DISTINCT FROM OLD.component OR NEW.structural <> OLD.structural THEN
    RAISE EXCEPTION 'Pilot variance values are immutable; record a new variance instead';
  END IF;
  IF OLD.status <> 'open' THEN RAISE EXCEPTION 'A resolved pilot variance cannot be changed'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fp_variance_guard BEFORE UPDATE OR DELETE ON public.financial_pilot_variances FOR EACH ROW EXECUTE FUNCTION public.guard_financial_pilot_variance();