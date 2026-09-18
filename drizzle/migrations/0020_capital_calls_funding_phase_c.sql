-- Fund Administration Phase C: capital calls, funding instructions, cash receipt.
--
-- Nothing here holds a second commitment or capital balance. Commitment and
-- contributed capital remain derived from commitment_events / capital_accounts;
-- cash remains authoritative in bank_transactions -> bank_reconciliations ->
-- journal_entries. These tables only express the CALL, the EXPECTATION, the
-- PROPOSED MATCH and the Harmonious decision trail.

CREATE TABLE public.capital_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  call_number INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id UUID REFERENCES public.capital_calls(id) ON DELETE SET NULL,
  title TEXT,
  purpose TEXT,
  call_type TEXT NOT NULL DEFAULT 'whole_fund',
  basis TEXT NOT NULL DEFAULT 'percentage_of_commitment',
  percentage_bps INTEGER,
  fixed_amount_cents BIGINT,
  notice_date DATE,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  commitment_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_called_cents BIGINT NOT NULL DEFAULT 0,
  total_received_cents BIGINT NOT NULL DEFAULT 0,
  notice_document_path TEXT,
  notice_document_name TEXT,
  prepared_by UUID,
  requested_by UUID,
  requested_at TIMESTAMPTZ,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  published_by UUID,
  published_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (offering_id, call_number, version)
);
CREATE INDEX capital_calls_offering_idx ON public.capital_calls (offering_id, status);

CREATE TABLE public.capital_call_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capital_call_id UUID NOT NULL REFERENCES public.capital_calls(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  position_id UUID REFERENCES public.investor_positions(id) ON DELETE SET NULL,
  onboarding_id UUID REFERENCES public.investor_onboardings(id) ON DELETE SET NULL,
  investment_profile_id UUID REFERENCES public.investment_profiles(id) ON DELETE SET NULL,
  investor_user_id UUID,
  display_name TEXT,
  commitment_cents BIGINT NOT NULL DEFAULT 0,
  previously_contributed_cents BIGINT NOT NULL DEFAULT 0,
  called_cents BIGINT NOT NULL DEFAULT 0,
  received_cents BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'outstanding',
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX capital_call_lines_call_idx ON public.capital_call_lines (capital_call_id);
CREATE INDEX capital_call_lines_investor_idx ON public.capital_call_lines (investor_user_id);
CREATE INDEX capital_call_lines_position_idx ON public.capital_call_lines (position_id);

CREATE TABLE public.funding_instruction_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  banking_setup_id UUID REFERENCES public.fund_banking_setups(id) ON DELETE SET NULL,
  bank_name TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  fingerprint TEXT,
  effective_date DATE,
  release_status TEXT NOT NULL DEFAULT 'draft',
  supersedes_id UUID REFERENCES public.funding_instruction_versions(id) ON DELETE SET NULL,
  change_reason TEXT,
  created_by UUID,
  submitted_by UUID,
  submitted_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  revoked_by UUID,
  revoked_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (offering_id, version)
);
CREATE INDEX funding_instruction_versions_idx
  ON public.funding_instruction_versions (offering_id, release_status);

CREATE TABLE public.expected_fundings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  capital_call_line_id UUID REFERENCES public.capital_call_lines(id) ON DELETE SET NULL,
  onboarding_id UUID REFERENCES public.investor_onboardings(id) ON DELETE SET NULL,
  position_id UUID REFERENCES public.investor_positions(id) ON DELETE SET NULL,
  investment_profile_id UUID REFERENCES public.investment_profiles(id) ON DELETE SET NULL,
  investor_user_id UUID,
  expected_amount_cents BIGINT NOT NULL DEFAULT 0,
  received_amount_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  reference_code TEXT NOT NULL,
  funding_instruction_version_id UUID REFERENCES public.funding_instruction_versions(id) ON DELETE SET NULL,
  expected_by DATE,
  status TEXT NOT NULL DEFAULT 'expected',
  investor_initiated_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX expected_fundings_reference_idx
  ON public.expected_fundings (offering_id, reference_code);
CREATE INDEX expected_fundings_investor_idx ON public.expected_fundings (investor_user_id, status);

CREATE TABLE public.funding_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  expected_funding_id UUID REFERENCES public.expected_fundings(id) ON DELETE SET NULL,
  bank_transaction_id UUID NOT NULL REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
  reconciliation_id UUID REFERENCES public.bank_reconciliations(id) ON DELETE SET NULL,
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  commitment_event_id UUID REFERENCES public.commitment_events(id) ON DELETE SET NULL,
  proposed_amount_cents BIGINT NOT NULL DEFAULT 0,
  variance_cents BIGINT NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'unmatched',
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  exception_kind TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  decision_reason TEXT,
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX funding_matches_one_approved_per_txn
  ON public.funding_matches (bank_transaction_id)
  WHERE status IN ('approved', 'posted');
CREATE INDEX funding_matches_queue_idx ON public.funding_matches (offering_id, status);

CREATE TABLE public.funding_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID REFERENCES public.offerings(id) ON DELETE CASCADE,
  expected_funding_id UUID REFERENCES public.expected_fundings(id) ON DELETE SET NULL,
  funding_match_id UUID REFERENCES public.funding_matches(id) ON DELETE SET NULL,
  bank_transaction_id UUID REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  capital_call_line_id UUID REFERENCES public.capital_call_lines(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'blocking',
  owner TEXT NOT NULL DEFAULT 'harmonious',
  status TEXT NOT NULL DEFAULT 'open',
  detail TEXT,
  resolution TEXT,
  raised_by UUID,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX funding_exceptions_idx ON public.funding_exceptions (offering_id, status);

CREATE TABLE public.capital_call_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID,
  capital_call_id UUID REFERENCES public.capital_calls(id) ON DELETE CASCADE,
  capital_call_line_id UUID REFERENCES public.capital_call_lines(id) ON DELETE SET NULL,
  expected_funding_id UUID REFERENCES public.expected_fundings(id) ON DELETE SET NULL,
  funding_match_id UUID REFERENCES public.funding_matches(id) ON DELETE SET NULL,
  funding_instruction_version_id UUID REFERENCES public.funding_instruction_versions(id) ON DELETE SET NULL,
  bank_transaction_id UUID,
  reconciliation_id UUID,
  journal_entry_id UUID,
  event TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  reason TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id UUID,
  actor_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX capital_call_events_idx ON public.capital_call_events (capital_call_id, created_at DESC);
CREATE INDEX capital_call_events_offering_idx ON public.capital_call_events (offering_id, created_at DESC);

GRANT SELECT ON public.capital_calls TO authenticated;
GRANT ALL ON public.capital_calls TO service_role;
GRANT SELECT ON public.capital_call_lines TO authenticated;
GRANT ALL ON public.capital_call_lines TO service_role;
GRANT SELECT ON public.funding_instruction_versions TO authenticated;
GRANT ALL ON public.funding_instruction_versions TO service_role;
GRANT SELECT ON public.expected_fundings TO authenticated;
GRANT ALL ON public.expected_fundings TO service_role;
GRANT SELECT ON public.funding_matches TO authenticated;
GRANT ALL ON public.funding_matches TO service_role;
GRANT SELECT ON public.funding_exceptions TO authenticated;
GRANT ALL ON public.funding_exceptions TO service_role;
GRANT SELECT ON public.capital_call_events TO authenticated;
GRANT ALL ON public.capital_call_events TO service_role;

ALTER TABLE public.capital_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capital_call_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funding_instruction_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expected_fundings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funding_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funding_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capital_call_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read capital calls" ON public.capital_calls
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "manager reads fund capital calls" ON public.capital_calls
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.fund_managers fm
            WHERE fm.offering_id = capital_calls.offering_id AND fm.user_id = auth.uid())
  );
CREATE POLICY "investor reads published capital calls" ON public.capital_calls
  FOR SELECT TO authenticated USING (
    status IN ('published', 'closed')
    AND EXISTS (SELECT 1 FROM public.capital_call_lines l
                WHERE l.capital_call_id = capital_calls.id AND l.investor_user_id = auth.uid())
  );

CREATE POLICY "staff read call lines" ON public.capital_call_lines
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "manager reads fund call lines" ON public.capital_call_lines
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.fund_managers fm
            WHERE fm.offering_id = capital_call_lines.offering_id AND fm.user_id = auth.uid())
  );
CREATE POLICY "investor reads own call lines" ON public.capital_call_lines
  FOR SELECT TO authenticated USING (investor_user_id = auth.uid());

CREATE POLICY "staff read funding instructions" ON public.funding_instruction_versions
  FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE POLICY "staff read expected fundings" ON public.expected_fundings
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "investor reads own expected funding" ON public.expected_fundings
  FOR SELECT TO authenticated USING (investor_user_id = auth.uid());

CREATE POLICY "staff read funding matches" ON public.funding_matches
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "staff read funding exceptions" ON public.funding_exceptions
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "staff read capital call events" ON public.capital_call_events
  FOR SELECT TO authenticated USING (public.is_any_staff());

-- A published capital call is a financial notice: corrections supersede it.
CREATE OR REPLACE FUNCTION public.protect_published_capital_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('published', 'superseded', 'closed') THEN
    IF NEW.commitment_snapshot IS DISTINCT FROM OLD.commitment_snapshot
       OR NEW.percentage_bps IS DISTINCT FROM OLD.percentage_bps
       OR NEW.fixed_amount_cents IS DISTINCT FROM OLD.fixed_amount_cents
       OR NEW.basis IS DISTINCT FROM OLD.basis
       OR NEW.call_type IS DISTINCT FROM OLD.call_type
       OR NEW.notice_date IS DISTINCT FROM OLD.notice_date
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.total_called_cents IS DISTINCT FROM OLD.total_called_cents
       OR NEW.call_number IS DISTINCT FROM OLD.call_number
       OR NEW.version IS DISTINCT FROM OLD.version THEN
      RAISE EXCEPTION 'a published capital call is immutable; issue a superseding version';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER capital_calls_protect_published
  BEFORE UPDATE ON public.capital_calls
  FOR EACH ROW EXECUTE FUNCTION public.protect_published_capital_call();

-- Published call lines keep the exact commitment snapshot they were issued on.
CREATE OR REPLACE FUNCTION public.protect_published_call_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE parent_status TEXT;
BEGIN
  SELECT status INTO parent_status FROM public.capital_calls WHERE id = OLD.capital_call_id;
  IF parent_status IN ('published', 'superseded', 'closed') THEN
    IF NEW.commitment_cents IS DISTINCT FROM OLD.commitment_cents
       OR NEW.previously_contributed_cents IS DISTINCT FROM OLD.previously_contributed_cents
       OR NEW.called_cents IS DISTINCT FROM OLD.called_cents
       OR NEW.investor_user_id IS DISTINCT FROM OLD.investor_user_id
       OR NEW.investment_profile_id IS DISTINCT FROM OLD.investment_profile_id
       OR NEW.position_id IS DISTINCT FROM OLD.position_id THEN
      RAISE EXCEPTION 'a published capital call line is immutable; issue a superseding version';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER capital_call_lines_protect_published
  BEFORE UPDATE ON public.capital_call_lines
  FOR EACH ROW EXECUTE FUNCTION public.protect_published_call_line();

-- Changing wire details is a material financial event: it can never stay
-- released, and a released version can never be edited in place.
CREATE OR REPLACE FUNCTION public.protect_funding_instructions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.release_status = 'released'
     AND (NEW.details IS DISTINCT FROM OLD.details
          OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
          OR NEW.banking_setup_id IS DISTINCT FROM OLD.banking_setup_id) THEN
    RAISE EXCEPTION 'released funding instructions are immutable; create a superseding version';
  END IF;
  IF NEW.details IS DISTINCT FROM OLD.details AND NEW.release_status = 'released' THEN
    RAISE EXCEPTION 'changed funding instructions require a fresh Harmonious release approval';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER funding_instruction_versions_protect
  BEFORE UPDATE ON public.funding_instruction_versions
  FOR EACH ROW EXECUTE FUNCTION public.protect_funding_instructions();

CREATE OR REPLACE FUNCTION public.protect_capital_call_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'capital call events are append-only';
END;
$$;
CREATE TRIGGER capital_call_events_append_only
  BEFORE UPDATE OR DELETE ON public.capital_call_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_capital_call_events();

CREATE TRIGGER expected_fundings_touch BEFORE UPDATE ON public.expected_fundings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER funding_matches_touch BEFORE UPDATE ON public.funding_matches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER funding_exceptions_touch BEFORE UPDATE ON public.funding_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();