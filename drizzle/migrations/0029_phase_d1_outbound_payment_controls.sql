-- Phase D1: outbound payment control hardening (additive only)

-- 1. Bank evidence fields for multi-factor outbound matching (nullable = evidence unavailable)
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS direction text,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS bank_account_id uuid,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS counterparty_fingerprint text;

-- 2. Frozen economic snapshot + reviewed withholding on the batch
ALTER TABLE public.distribution_batches
  ADD COLUMN IF NOT EXISTS economic_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS economic_snapshot_hash text,
  ADD COLUMN IF NOT EXISTS economic_snapshot_at timestamptz,
  ADD COLUMN IF NOT EXISTS withholding_basis jsonb,
  ADD COLUMN IF NOT EXISTS withholding_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS withholding_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_bank_account_id uuid;

-- 3. Separate identities for every outbound step
ALTER TABLE public.distribution_payments
  ADD COLUMN IF NOT EXISTS recorded_as text NOT NULL DEFAULT 'external_bank_action',
  ADD COLUMN IF NOT EXISTS external_reference text,
  ADD COLUMN IF NOT EXISTS match_outcome text,
  ADD COLUMN IF NOT EXISTS match_evidence jsonb,
  ADD COLUMN IF NOT EXISTS reconciled_by uuid,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_approved_by uuid,
  ADD COLUMN IF NOT EXISTS reconciliation_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_by uuid,
  ADD COLUMN IF NOT EXISTS reversal_requested_by uuid,
  ADD COLUMN IF NOT EXISTS reversal_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS reversal_approved_by uuid,
  ADD COLUMN IF NOT EXISTS reversal_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

CREATE OR REPLACE FUNCTION public.enforce_distribution_payment_duties()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b record; jstatus text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT prepared_by, requested_by, final_approved_by INTO b
      FROM public.distribution_batches WHERE id = NEW.batch_id;
    IF NEW.submitted_by IS NOT NULL AND (NEW.submitted_by = b.requested_by OR NEW.submitted_by = b.prepared_by) THEN
      RAISE EXCEPTION 'segregation of duties: the requester or preparer cannot record the payment as sent';
    END IF;
    IF NEW.submitted_by IS NOT NULL AND NEW.submitted_by = b.final_approved_by THEN
      RAISE EXCEPTION 'segregation of duties: the final approver cannot record the payment as sent';
    END IF;
  END IF;
  IF NEW.reconciliation_approved_by IS NOT NULL AND NEW.reconciliation_approved_by = NEW.reconciled_by THEN
    RAISE EXCEPTION 'segregation of duties: the reconciler cannot approve their own reconciliation';
  END IF;
  IF NEW.posted_by IS NOT NULL AND NEW.posted_by = NEW.submitted_by THEN
    RAISE EXCEPTION 'segregation of duties: the person who recorded the payment cannot post it';
  END IF;
  IF NEW.reversal_approved_by IS NOT NULL AND NEW.reversal_approved_by = NEW.reversal_requested_by THEN
    RAISE EXCEPTION 'segregation of duties: the reversal requester cannot approve the reversal';
  END IF;
  IF NEW.settled_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.settled_at IS NULL) THEN
    IF NEW.reconciliation_id IS NULL OR NEW.reconciliation_approved_by IS NULL OR NEW.journal_entry_id IS NULL THEN
      RAISE EXCEPTION 'a payment is settled only after approved reconciliation and a posted journal';
    END IF;
    SELECT status INTO jstatus FROM public.journal_entries WHERE id = NEW.journal_entry_id;
    IF jstatus IS DISTINCT FROM 'posted' THEN
      RAISE EXCEPTION 'a payment is settled only after its journal is posted';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS distribution_payments_duties ON public.distribution_payments;
CREATE TRIGGER distribution_payments_duties BEFORE INSERT OR UPDATE ON public.distribution_payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_distribution_payment_duties();

-- Snapshot immutability on batches once approved
CREATE OR REPLACE FUNCTION public.protect_distribution_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status NOT IN ('draft') THEN
      RAISE EXCEPTION 'distribution batches beyond draft are permanent; cancel or supersede instead';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.economic_snapshot_hash IS NOT NULL
     AND (NEW.economic_snapshot IS DISTINCT FROM OLD.economic_snapshot
          OR NEW.economic_snapshot_hash IS DISTINCT FROM OLD.economic_snapshot_hash
          OR NEW.allocation_run_id IS DISTINCT FROM OLD.allocation_run_id) THEN
    RAISE EXCEPTION 'the frozen economic snapshot of a distribution is immutable; supersede instead';
  END IF;
  IF OLD.status IN ('approved','executing','completed','superseded')
     AND NEW.withholding_basis IS DISTINCT FROM OLD.withholding_basis THEN
    RAISE EXCEPTION 'withholding used on an approved distribution is immutable';
  END IF;
  IF NEW.executed_by IS NOT NULL AND NEW.executed_by = NEW.final_approved_by THEN
    RAISE EXCEPTION 'segregation of duties: the final approver cannot record the payment as sent';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS distribution_batches_snapshot ON public.distribution_batches;
CREATE TRIGGER distribution_batches_snapshot BEFORE UPDATE OR DELETE ON public.distribution_batches
  FOR EACH ROW EXECUTE FUNCTION public.protect_distribution_snapshot();

CREATE OR REPLACE FUNCTION public.protect_distribution_line_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s text;
BEGIN
  SELECT status INTO s FROM public.distribution_batches WHERE id = OLD.batch_id;
  IF s IS NOT NULL AND s <> 'draft' THEN
    RAISE EXCEPTION 'distribution lines beyond draft are permanent';
  END IF;
  RETURN OLD;
END; $$;
DROP TRIGGER IF EXISTS distribution_lines_no_delete ON public.distribution_lines;
CREATE TRIGGER distribution_lines_no_delete BEFORE DELETE ON public.distribution_lines
  FOR EACH ROW EXECUTE FUNCTION public.protect_distribution_line_delete();

-- 4. Destination instruction versions: frozen once verified / approved / superseded / used
CREATE OR REPLACE FUNCTION public.protect_payment_instruction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE frozen boolean;
BEGIN
  frozen := OLD.status IN ('approved','superseded','revoked')
    OR OLD.verification_status = 'verified'
    OR EXISTS (SELECT 1 FROM public.distribution_payments p WHERE p.payment_instruction_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.distribution_lines l WHERE l.payment_instruction_id = OLD.id);
  IF TG_OP = 'DELETE' THEN
    IF frozen THEN RAISE EXCEPTION 'a verified, approved or used payment instruction version is permanent'; END IF;
    RETURN OLD;
  END IF;
  IF frozen AND (
       NEW.secured_details IS DISTINCT FROM OLD.secured_details
    OR NEW.fingerprint IS DISTINCT FROM OLD.fingerprint
    OR NEW.method IS DISTINCT FROM OLD.method
    OR NEW.beneficiary_name IS DISTINCT FROM OLD.beneficiary_name
    OR NEW.bank_name IS DISTINCT FROM OLD.bank_name
    OR NEW.country IS DISTINCT FROM OLD.country
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.masked_account IS DISTINCT FROM OLD.masked_account
    OR NEW.masked_routing IS DISTINCT FROM OLD.masked_routing
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.investor_user_id IS DISTINCT FROM OLD.investor_user_id
    OR NEW.investment_profile_id IS DISTINCT FROM OLD.investment_profile_id
    OR NEW.offering_id IS DISTINCT FROM OLD.offering_id) THEN
    RAISE EXCEPTION 'this payment instruction version is frozen; create a new version instead';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS investor_payment_instructions_protect ON public.investor_payment_instructions;
CREATE TRIGGER investor_payment_instructions_protect BEFORE UPDATE OR DELETE ON public.investor_payment_instructions
  FOR EACH ROW EXECUTE FUNCTION public.protect_payment_instruction();

-- 5. fund_distributions becomes an engine-controlled read projection
ALTER TABLE public.fund_distributions
  ADD COLUMN IF NOT EXISTS distribution_payment_id uuid UNIQUE REFERENCES public.distribution_payments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'legacy';
COMMENT ON TABLE public.fund_distributions IS 'Read projection of settled distribution payments. Written only by the distribution engine after reconciliation and posted accounting. Legacy rows preserved.';

DROP POLICY IF EXISTS "distributions editable by fund team" ON public.fund_distributions;
REVOKE INSERT, UPDATE, DELETE ON public.fund_distributions FROM authenticated, anon;
GRANT SELECT ON public.fund_distributions TO authenticated;
GRANT ALL ON public.fund_distributions TO service_role;

CREATE OR REPLACE FUNCTION public.protect_fund_distribution_projection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p record; jstatus text;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    RAISE EXCEPTION 'fund distribution history is permanent; corrections flow through the distribution engine';
  END IF;
  IF NEW.distribution_payment_id IS NULL THEN
    RAISE EXCEPTION 'a fund distribution can only be generated from a settled distribution payment';
  END IF;
  SELECT * INTO p FROM public.distribution_payments WHERE id = NEW.distribution_payment_id;
  IF p.id IS NULL OR p.reconciliation_approved_by IS NULL OR p.journal_entry_id IS NULL THEN
    RAISE EXCEPTION 'a fund distribution requires approved reconciliation and posted accounting';
  END IF;
  SELECT status INTO jstatus FROM public.journal_entries WHERE id = p.journal_entry_id;
  IF jstatus IS DISTINCT FROM 'posted' THEN
    RAISE EXCEPTION 'a fund distribution requires a posted journal';
  END IF;
  NEW.source := 'distribution_engine';
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS fund_distributions_set_updated_at ON public.fund_distributions;
DROP TRIGGER IF EXISTS fund_distributions_projection ON public.fund_distributions;
CREATE TRIGGER fund_distributions_projection BEFORE INSERT OR UPDATE OR DELETE ON public.fund_distributions
  FOR EACH ROW EXECUTE FUNCTION public.protect_fund_distribution_projection();

-- 6. Legacy payment_instructions can no longer be typed into "settled"
CREATE OR REPLACE FUNCTION public.block_legacy_settlement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.bank_status = 'settled' AND (TG_OP = 'INSERT' OR OLD.bank_status IS DISTINCT FROM 'settled') THEN
    RAISE EXCEPTION 'settlement is recorded only by bank reconciliation and posted accounting';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS payment_instructions_no_manual_settle ON public.payment_instructions;
CREATE TRIGGER payment_instructions_no_manual_settle BEFORE INSERT OR UPDATE ON public.payment_instructions
  FOR EACH ROW EXECUTE FUNCTION public.block_legacy_settlement();
