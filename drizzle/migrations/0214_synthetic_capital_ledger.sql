CREATE TABLE public.synthetic_capital_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  position_id uuid NOT NULL,
  allocation_run_id uuid NOT NULL REFERENCES public.synthetic_allocation_runs(id),
  allocation_line_id uuid NOT NULL REFERENCES public.synthetic_allocation_lines(id),
  policy_id uuid NOT NULL REFERENCES public.synthetic_allocation_policies(id),
  policy_version integer NOT NULL,
  period_start date NOT NULL, period_end date NOT NULL,
  version integer NOT NULL DEFAULT 1,
  supersedes_id uuid REFERENCES public.synthetic_capital_accounts(id),
  correction_reason text,
  investor_name text NOT NULL, class_label text NOT NULL,
  opening_capital_source text NOT NULL,
  admission_status text NOT NULL CHECK (admission_status IN ('formally_admitted','source_only_not_formally_admitted')),
  opening_capital_cents bigint NOT NULL,
  contributions_cents bigint NOT NULL,
  interest_cents bigint NOT NULL,
  unrealized_gain_cents bigint NOT NULL,
  operating_expense_cents bigint NOT NULL,
  management_fee_cents bigint NOT NULL,
  ending_capital_cents bigint NOT NULL,
  unpaid_call_cents bigint NOT NULL DEFAULT 0,
  credits_liability_cents bigint NOT NULL DEFAULT 0,
  restrictions jsonb NOT NULL DEFAULT '[]'::jsonb,
  contribution_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  classification text NOT NULL DEFAULT 'DEMO / SYNTHETIC — UNAUDITED — NOT CONTRACTUAL — NOT FOR INVESTOR DISTRIBUTION'
    CHECK (classification = 'DEMO / SYNTHETIC — UNAUDITED — NOT CONTRACTUAL — NOT FOR INVESTOR DISTRIBUTION'),
  prepared_by uuid NOT NULL, prepared_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid, approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ending_capital_cents = opening_capital_cents + contributions_cents + interest_cents + unrealized_gain_cents + operating_expense_cents + management_fee_cents),
  CHECK (approved_by IS NULL OR approved_by <> prepared_by),
  CHECK (version = 1 OR (supersedes_id IS NOT NULL AND length(coalesce(correction_reason,'')) >= 20)),
  UNIQUE (allocation_run_id, position_id, version)
);
CREATE TABLE public.synthetic_capital_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.synthetic_capital_accounts(id),
  offering_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('opening','contribution','interest_income','unrealized_gain_synthetic','operating_expense','management_fee')),
  amount_cents bigint NOT NULL,
  effective_date date NOT NULL,
  source_ref text NOT NULL CHECK (length(source_ref) > 0),
  classification text NOT NULL DEFAULT 'DEMO / SYNTHETIC — UNAUDITED — NOT CONTRACTUAL — NOT FOR INVESTOR DISTRIBUTION'
    CHECK (classification = 'DEMO / SYNTHETIC — UNAUDITED — NOT CONTRACTUAL — NOT FOR INVESTOR DISTRIBUTION'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, kind, source_ref)
);
GRANT ALL ON public.synthetic_capital_accounts, public.synthetic_capital_movements TO service_role;
ALTER TABLE public.synthetic_capital_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synthetic_capital_movements ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.guard_synthetic_capital_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; r record; d jsonb;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Synthetic capital accounts are immutable; record a new controlled version.'; END IF;
  PERFORM public.assert_demo_offering(NEW.offering_id);
  SELECT * INTO l FROM public.synthetic_allocation_lines WHERE id = NEW.allocation_line_id;
  SELECT * INTO r FROM public.synthetic_allocation_runs WHERE id = NEW.allocation_run_id;
  IF l.run_id <> NEW.allocation_run_id OR l.position_id <> NEW.position_id OR r.offering_id <> NEW.offering_id OR l.offering_id <> NEW.offering_id THEN
    RAISE EXCEPTION 'Cross-fund or mismatched allocation reference refused.';
  END IF;
  IF r.policy_id <> NEW.policy_id THEN RAISE EXCEPTION 'Policy must match the allocation run.'; END IF;
  IF NEW.version = 1 THEN
    d := l.detail;
    IF NEW.opening_capital_cents <> (d->>'openingCapitalCents')::bigint OR NEW.contributions_cents <> (d->>'contributionsCents')::bigint
       OR NEW.interest_cents <> (d->>'interestCents')::bigint OR NEW.unrealized_gain_cents <> (d->>'unrealizedGainCents')::bigint
       OR NEW.operating_expense_cents <> (d->>'operatingExpenseCents')::bigint OR NEW.management_fee_cents <> (d->>'managementFeeCents')::bigint
       OR NEW.ending_capital_cents <> l.ending_capital_cents THEN
      RAISE EXCEPTION 'Synthetic capital account must equal the approved preview line exactly.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_synthetic_capital_account BEFORE INSERT OR UPDATE OR DELETE ON public.synthetic_capital_accounts FOR EACH ROW EXECUTE FUNCTION public.guard_synthetic_capital_account();

CREATE OR REPLACE FUNCTION public.guard_synthetic_capital_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Synthetic capital movements are immutable.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.synthetic_capital_accounts a WHERE a.id = NEW.account_id AND a.offering_id = NEW.offering_id) THEN
    RAISE EXCEPTION 'Cross-fund movement refused.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_synthetic_capital_movement BEFORE INSERT OR UPDATE OR DELETE ON public.synthetic_capital_movements FOR EACH ROW EXECUTE FUNCTION public.guard_synthetic_capital_movement();