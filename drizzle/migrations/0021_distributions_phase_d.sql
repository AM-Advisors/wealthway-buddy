-- Fund Administration Phase D: distributions, withholding and outbound money.
--
-- This layer holds NO money truth of its own. Cash remains authoritative in
-- bank_transactions -> bank_reconciliations -> journal_entries, and investor
-- capital remains authoritative in capital_accounts / commitment_events.
-- These tables express the ENTITLEMENT, the APPROVAL CHAIN, the DESTINATION,
-- the WITHHOLDING, the EXECUTION and the audit trail behind it.

CREATE TABLE public.distribution_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  batch_number INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id UUID REFERENCES public.distribution_batches(id) ON DELETE SET NULL,
  title TEXT,
  purpose TEXT,
  distribution_type TEXT NOT NULL DEFAULT 'ordinary',
  currency TEXT NOT NULL DEFAULT 'USD',
  allocation_run_id UUID REFERENCES public.allocation_runs(id) ON DELETE SET NULL,
  nav_version_id UUID REFERENCES public.nav_versions(id) ON DELETE SET NULL,
  source_proceeds TEXT,
  source_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_date DATE,
  effective_date DATE,
  payment_date DATE,
  total_gross_cents BIGINT NOT NULL DEFAULT 0,
  total_withholding_cents BIGINT NOT NULL DEFAULT 0,
  total_fee_cents BIGINT NOT NULL DEFAULT 0,
  total_net_cents BIGINT NOT NULL DEFAULT 0,
  reserve_cents BIGINT NOT NULL DEFAULT 0,
  declared_amount_cents BIGINT NOT NULL DEFAULT 0,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  payment_status TEXT NOT NULL DEFAULT 'not_started',
  balances BOOLEAN NOT NULL DEFAULT false,
  balance_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  prepared_by UUID,
  prepared_at TIMESTAMPTZ,
  requested_by UUID,
  requested_at TIMESTAMPTZ,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  manager_approved_by UUID,
  manager_approved_at TIMESTAMPTZ,
  final_approved_by UUID,
  final_approved_at TIMESTAMPTZ,
  executed_by UUID,
  executed_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (offering_id, batch_number, version)
);
CREATE INDEX distribution_batches_offering_idx
  ON public.distribution_batches (offering_id, status);

CREATE TABLE public.investor_payment_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_user_id UUID NOT NULL,
  investment_profile_id UUID REFERENCES public.investment_profiles(id) ON DELETE CASCADE,
  offering_id UUID REFERENCES public.offerings(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id UUID REFERENCES public.investor_payment_instructions(id) ON DELETE SET NULL,
  method TEXT NOT NULL DEFAULT 'wire',
  label TEXT,
  beneficiary_name TEXT,
  bank_name TEXT,
  country TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  -- Full values are held server-side only; browsers receive the masked form.
  secured_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  masked_account TEXT,
  masked_routing TEXT,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  verification_method TEXT,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  effective_date DATE,
  cooling_off_until TIMESTAMPTZ,
  cooling_off_waived_by UUID,
  cooling_off_waiver_reason TEXT,
  revoked_by UUID,
  revoked_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX investor_payment_instructions_owner_idx
  ON public.investor_payment_instructions (investor_user_id, investment_profile_id, status);

CREATE TABLE public.payment_instruction_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instruction_id UUID REFERENCES public.investor_payment_instructions(id) ON DELETE SET NULL,
  previous_instruction_id UUID REFERENCES public.investor_payment_instructions(id) ON DELETE SET NULL,
  investor_user_id UUID NOT NULL,
  investment_profile_id UUID REFERENCES public.investment_profiles(id) ON DELETE SET NULL,
  offering_id UUID REFERENCES public.offerings(id) ON DELETE SET NULL,
  change_kind TEXT NOT NULL DEFAULT 'destination_change',
  risk_level TEXT NOT NULL DEFAULT 'high',
  old_masked TEXT,
  new_masked TEXT,
  changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'requested',
  stepup_verified_at TIMESTAMPTZ,
  stepup_method TEXT,
  independent_notice_sent_at TIMESTAMPTZ,
  independent_notice_channel TEXT,
  harmonious_notified_at TIMESTAMPTZ,
  cooling_off_until TIMESTAMPTZ,
  cooling_off_waived_by UUID,
  cooling_off_waiver_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  requested_by UUID,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payment_instruction_changes_idx
  ON public.payment_instruction_changes (investor_user_id, status);

CREATE TABLE public.distribution_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.distribution_batches(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  position_id UUID REFERENCES public.investor_positions(id) ON DELETE SET NULL,
  investment_profile_id UUID REFERENCES public.investment_profiles(id) ON DELETE SET NULL,
  investor_user_id UUID,
  display_name TEXT,
  investor_class_id UUID REFERENCES public.investor_classes(id) ON DELETE SET NULL,
  distribution_type TEXT NOT NULL DEFAULT 'ordinary',
  entitlement_basis TEXT NOT NULL DEFAULT 'allocation_run',
  entitlement_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  commitment_cents BIGINT NOT NULL DEFAULT 0,
  contributed_cents BIGINT NOT NULL DEFAULT 0,
  capital_account_cents BIGINT NOT NULL DEFAULT 0,
  gross_cents BIGINT NOT NULL DEFAULT 0,
  withholding_cents BIGINT NOT NULL DEFAULT 0,
  fee_cents BIGINT NOT NULL DEFAULT 0,
  net_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  characterization JSONB NOT NULL DEFAULT '{}'::jsonb,
  payment_method TEXT,
  payment_instruction_id UUID REFERENCES public.investor_payment_instructions(id) ON DELETE SET NULL,
  payment_instruction_version INTEGER,
  destination_verified BOOLEAN NOT NULL DEFAULT false,
  manual_adjustment_cents BIGINT NOT NULL DEFAULT 0,
  manual_adjustment_reason TEXT,
  manual_adjustment_evidence TEXT,
  manual_adjustment_approved_by UUID,
  manual_adjustment_approved_at TIMESTAMPTZ,
  investor_confirmation_required BOOLEAN NOT NULL DEFAULT false,
  investor_confirmed_at TIMESTAMPTZ,
  approval_state TEXT NOT NULL DEFAULT 'draft',
  payment_state TEXT NOT NULL DEFAULT 'not_started',
  reconciliation_state TEXT NOT NULL DEFAULT 'not_started',
  accounting_state TEXT NOT NULL DEFAULT 'not_started',
  hold_state TEXT NOT NULL DEFAULT 'clear',
  effective_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX distribution_lines_batch_idx ON public.distribution_lines (batch_id);
CREATE INDEX distribution_lines_investor_idx
  ON public.distribution_lines (investor_user_id, investment_profile_id);

CREATE TABLE public.distribution_withholdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_line_id UUID NOT NULL REFERENCES public.distribution_lines(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  withholding_type TEXT NOT NULL,
  jurisdiction TEXT,
  basis_cents BIGINT NOT NULL DEFAULT 0,
  rate_bps INTEGER NOT NULL DEFAULT 0,
  amount_cents BIGINT NOT NULL DEFAULT 0,
  tax_profile_id UUID REFERENCES public.investor_tax_profiles(id) ON DELETE SET NULL,
  documentation_form TEXT,
  determination_reason TEXT,
  determined_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX distribution_withholdings_line_idx
  ON public.distribution_withholdings (distribution_line_id);

CREATE TABLE public.distribution_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_line_id UUID NOT NULL REFERENCES public.distribution_lines(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.distribution_batches(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL DEFAULT 1,
  reissue_of_id UUID REFERENCES public.distribution_payments(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'manual_bank',
  provider_payment_id TEXT,
  idempotency_key TEXT NOT NULL,
  payment_instruction_id UUID REFERENCES public.investor_payment_instructions(id) ON DELETE SET NULL,
  payment_instruction_version INTEGER,
  submitted_amount_cents BIGINT NOT NULL DEFAULT 0,
  submitted_currency TEXT NOT NULL DEFAULT 'USD',
  submitted_destination JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_destination_masked TEXT,
  submitting_system TEXT NOT NULL DEFAULT 'harmonious_portal',
  approval_chain JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'submitted',
  failure_reason TEXT,
  bank_transaction_id UUID REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  reconciliation_id UUID REFERENCES public.bank_reconciliations(id) ON DELETE SET NULL,
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  commitment_event_id UUID REFERENCES public.commitment_events(id) ON DELETE SET NULL,
  submitted_by UUID,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX distribution_payments_idempotency_idx
  ON public.distribution_payments (idempotency_key);
CREATE UNIQUE INDEX distribution_payments_provider_idx
  ON public.distribution_payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
CREATE INDEX distribution_payments_line_idx ON public.distribution_payments (distribution_line_id);

CREATE TABLE public.distribution_provider_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES public.distribution_payments(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  provider_payment_id TEXT,
  event_type TEXT NOT NULL,
  reported_amount_cents BIGINT,
  reported_currency TEXT,
  reported_destination_masked TEXT,
  reported_direction TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_status TEXT NOT NULL DEFAULT 'pending',
  correlation_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX distribution_provider_events_dedupe_idx
  ON public.distribution_provider_events (provider, provider_event_id);

CREATE TABLE public.distribution_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID REFERENCES public.offerings(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.distribution_batches(id) ON DELETE SET NULL,
  distribution_line_id UUID REFERENCES public.distribution_lines(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.distribution_payments(id) ON DELETE SET NULL,
  provider_event_id UUID REFERENCES public.distribution_provider_events(id) ON DELETE SET NULL,
  instruction_change_id UUID REFERENCES public.payment_instruction_changes(id) ON DELETE SET NULL,
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
CREATE INDEX distribution_exceptions_idx ON public.distribution_exceptions (offering_id, status);

CREATE TABLE public.distribution_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_line_id UUID NOT NULL REFERENCES public.distribution_lines(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.distribution_batches(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  investor_user_id UUID,
  investment_profile_id UUID REFERENCES public.investment_profiles(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id UUID REFERENCES public.distribution_notices(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  document_path TEXT,
  document_name TEXT,
  report_id UUID REFERENCES public.financial_reports(id) ON DELETE SET NULL,
  published_by UUID,
  published_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX distribution_notices_investor_idx
  ON public.distribution_notices (investor_user_id, status);

CREATE TABLE public.distribution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID,
  batch_id UUID REFERENCES public.distribution_batches(id) ON DELETE CASCADE,
  distribution_line_id UUID REFERENCES public.distribution_lines(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.distribution_payments(id) ON DELETE SET NULL,
  instruction_id UUID REFERENCES public.investor_payment_instructions(id) ON DELETE SET NULL,
  instruction_change_id UUID REFERENCES public.payment_instruction_changes(id) ON DELETE SET NULL,
  provider_event_id UUID REFERENCES public.distribution_provider_events(id) ON DELETE SET NULL,
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
CREATE INDEX distribution_events_batch_idx ON public.distribution_events (batch_id, created_at DESC);
CREATE INDEX distribution_events_offering_idx
  ON public.distribution_events (offering_id, created_at DESC);

GRANT SELECT ON public.distribution_batches TO authenticated;
GRANT ALL ON public.distribution_batches TO service_role;
GRANT SELECT ON public.distribution_lines TO authenticated;
GRANT ALL ON public.distribution_lines TO service_role;
GRANT SELECT ON public.distribution_withholdings TO authenticated;
GRANT ALL ON public.distribution_withholdings TO service_role;
GRANT SELECT ON public.investor_payment_instructions TO authenticated;
GRANT ALL ON public.investor_payment_instructions TO service_role;
GRANT SELECT ON public.payment_instruction_changes TO authenticated;
GRANT ALL ON public.payment_instruction_changes TO service_role;
GRANT SELECT ON public.distribution_payments TO authenticated;
GRANT ALL ON public.distribution_payments TO service_role;
GRANT SELECT ON public.distribution_provider_events TO authenticated;
GRANT ALL ON public.distribution_provider_events TO service_role;
GRANT SELECT ON public.distribution_exceptions TO authenticated;
GRANT ALL ON public.distribution_exceptions TO service_role;
GRANT SELECT ON public.distribution_notices TO authenticated;
GRANT ALL ON public.distribution_notices TO service_role;
GRANT SELECT ON public.distribution_events TO authenticated;
GRANT ALL ON public.distribution_events TO service_role;

ALTER TABLE public.distribution_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_withholdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_payment_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_instruction_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read distribution batches" ON public.distribution_batches
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "manager reads fund distribution batches" ON public.distribution_batches
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.fund_managers fm
            WHERE fm.offering_id = distribution_batches.offering_id AND fm.user_id = auth.uid())
  );
CREATE POLICY "investor reads own distribution batches" ON public.distribution_batches
  FOR SELECT TO authenticated USING (
    status IN ('approved', 'executing', 'completed', 'superseded')
    AND EXISTS (SELECT 1 FROM public.distribution_lines l
                WHERE l.batch_id = distribution_batches.id AND l.investor_user_id = auth.uid())
  );

CREATE POLICY "staff read distribution lines" ON public.distribution_lines
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "manager reads fund distribution lines" ON public.distribution_lines
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.fund_managers fm
            WHERE fm.offering_id = distribution_lines.offering_id AND fm.user_id = auth.uid())
  );
CREATE POLICY "investor reads own distribution lines" ON public.distribution_lines
  FOR SELECT TO authenticated USING (investor_user_id = auth.uid());

CREATE POLICY "staff read distribution withholdings" ON public.distribution_withholdings
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "investor reads own withholdings" ON public.distribution_withholdings
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.distribution_lines l
            WHERE l.id = distribution_withholdings.distribution_line_id
              AND l.investor_user_id = auth.uid())
  );

-- Payment destinations: only Harmonious and the exact owner, never a manager.
CREATE POLICY "staff read payment instructions" ON public.investor_payment_instructions
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "owner reads own payment instructions" ON public.investor_payment_instructions
  FOR SELECT TO authenticated USING (investor_user_id = auth.uid());

CREATE POLICY "staff read instruction changes" ON public.payment_instruction_changes
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "owner reads own instruction changes" ON public.payment_instruction_changes
  FOR SELECT TO authenticated USING (investor_user_id = auth.uid());

CREATE POLICY "staff read distribution payments" ON public.distribution_payments
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "staff read provider events" ON public.distribution_provider_events
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "staff read distribution exceptions" ON public.distribution_exceptions
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "staff read distribution events" ON public.distribution_events
  FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE POLICY "staff read distribution notices" ON public.distribution_notices
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "investor reads own distribution notices" ON public.distribution_notices
  FOR SELECT TO authenticated USING (
    status = 'published' AND investor_user_id = auth.uid()
  );

-- An approved distribution batch is a financial authorization: corrections
-- supersede it, they never edit it.
CREATE OR REPLACE FUNCTION public.protect_approved_distribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('approved', 'executing', 'completed', 'superseded') THEN
    IF NEW.total_gross_cents IS DISTINCT FROM OLD.total_gross_cents
       OR NEW.total_withholding_cents IS DISTINCT FROM OLD.total_withholding_cents
       OR NEW.total_fee_cents IS DISTINCT FROM OLD.total_fee_cents
       OR NEW.total_net_cents IS DISTINCT FROM OLD.total_net_cents
       OR NEW.declared_amount_cents IS DISTINCT FROM OLD.declared_amount_cents
       OR NEW.distribution_type IS DISTINCT FROM OLD.distribution_type
       OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
       OR NEW.batch_number IS DISTINCT FROM OLD.batch_number
       OR NEW.version IS DISTINCT FROM OLD.version THEN
      RAISE EXCEPTION 'an approved distribution is immutable; issue a superseding version';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER distribution_batches_protect
  BEFORE UPDATE ON public.distribution_batches
  FOR EACH ROW EXECUTE FUNCTION public.protect_approved_distribution();

-- Once the batch is approved, per-investor economics are frozen.
CREATE OR REPLACE FUNCTION public.protect_approved_distribution_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE parent_status TEXT;
BEGIN
  SELECT status INTO parent_status FROM public.distribution_batches WHERE id = OLD.batch_id;
  IF parent_status IN ('approved', 'executing', 'completed', 'superseded') THEN
    IF NEW.gross_cents IS DISTINCT FROM OLD.gross_cents
       OR NEW.withholding_cents IS DISTINCT FROM OLD.withholding_cents
       OR NEW.fee_cents IS DISTINCT FROM OLD.fee_cents
       OR NEW.net_cents IS DISTINCT FROM OLD.net_cents
       OR NEW.investor_user_id IS DISTINCT FROM OLD.investor_user_id
       OR NEW.investment_profile_id IS DISTINCT FROM OLD.investment_profile_id
       OR NEW.position_id IS DISTINCT FROM OLD.position_id THEN
      RAISE EXCEPTION 'an approved distribution line is immutable; issue a superseding version';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER distribution_lines_protect
  BEFORE UPDATE ON public.distribution_lines
  FOR EACH ROW EXECUTE FUNCTION public.protect_approved_distribution_line();

-- Approved destinations are immutable; a change means a new version.
CREATE OR REPLACE FUNCTION public.protect_payment_instruction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('approved', 'superseded', 'revoked')
     AND (NEW.secured_details IS DISTINCT FROM OLD.secured_details
          OR NEW.fingerprint IS DISTINCT FROM OLD.fingerprint
          OR NEW.method IS DISTINCT FROM OLD.method
          OR NEW.beneficiary_name IS DISTINCT FROM OLD.beneficiary_name) THEN
    RAISE EXCEPTION 'approved payment instructions are immutable; create a superseding version';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER investor_payment_instructions_protect
  BEFORE UPDATE ON public.investor_payment_instructions
  FOR EACH ROW EXECUTE FUNCTION public.protect_payment_instruction();

-- A submitted payment is never rewritten or erased; failures are new states.
CREATE OR REPLACE FUNCTION public.protect_distribution_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'outbound payment records are permanent';
  END IF;
  IF NEW.submitted_amount_cents IS DISTINCT FROM OLD.submitted_amount_cents
     OR NEW.submitted_destination IS DISTINCT FROM OLD.submitted_destination
     OR NEW.payment_instruction_id IS DISTINCT FROM OLD.payment_instruction_id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.approval_chain IS DISTINCT FROM OLD.approval_chain THEN
    RAISE EXCEPTION 'the submitted amount, destination and approval chain of a payment are immutable';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER distribution_payments_protect
  BEFORE UPDATE ON public.distribution_payments
  FOR EACH ROW EXECUTE FUNCTION public.protect_distribution_payment();
CREATE TRIGGER distribution_payments_no_delete
  BEFORE DELETE ON public.distribution_payments
  FOR EACH ROW EXECUTE FUNCTION public.protect_distribution_payment();

-- A published notice is a delivered financial document.
CREATE OR REPLACE FUNCTION public.protect_published_distribution_notice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'published'
     AND (NEW.content IS DISTINCT FROM OLD.content
          OR NEW.version IS DISTINCT FROM OLD.version
          OR NEW.document_path IS DISTINCT FROM OLD.document_path) THEN
    RAISE EXCEPTION 'a published distribution notice is immutable; issue a superseding version';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER distribution_notices_protect
  BEFORE UPDATE ON public.distribution_notices
  FOR EACH ROW EXECUTE FUNCTION public.protect_published_distribution_notice();

CREATE OR REPLACE FUNCTION public.protect_distribution_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'the distribution audit trail is append-only';
END;
$$;
CREATE TRIGGER distribution_events_append_only
  BEFORE UPDATE OR DELETE ON public.distribution_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_distribution_events();

CREATE TRIGGER distribution_withholdings_touch BEFORE UPDATE ON public.distribution_withholdings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER payment_instruction_changes_touch BEFORE UPDATE ON public.payment_instruction_changes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER distribution_exceptions_touch BEFORE UPDATE ON public.distribution_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();