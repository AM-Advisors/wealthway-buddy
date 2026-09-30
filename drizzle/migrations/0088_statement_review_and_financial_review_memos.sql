ALTER TABLE public.capital_account_statements
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS notified_by uuid;

ALTER TABLE public.capital_account_statements
  ADD CONSTRAINT capital_account_statements_review_status_chk
  CHECK (review_status IN ('draft','approved','returned'));

-- Statements that already existed were visible to investors; keep them visible.
UPDATE public.capital_account_statements SET review_status = 'approved', reviewed_at = generated_at WHERE review_status = 'draft';

CREATE OR REPLACE FUNCTION public.protect_capital_statement_review()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.review_status <> OLD.review_status THEN
    IF OLD.review_status <> 'draft' THEN
      RAISE EXCEPTION 'A reviewed capital account statement cannot be reviewed again; produce a new version.';
    END IF;
    IF NEW.reviewed_by IS NULL OR NEW.reviewed_by = OLD.generated_by THEN
      RAISE EXCEPTION 'A capital account statement must be reviewed by someone other than the person who produced it.';
    END IF;
    IF NEW.review_status = 'returned' AND coalesce(length(trim(NEW.review_note)),0) = 0 THEN
      RAISE EXCEPTION 'Returning a statement needs a note.';
    END IF;
  END IF;
  IF OLD.review_status <> 'draft' AND (NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.version <> OLD.version OR NEW.application_id <> OLD.application_id) THEN
    RAISE EXCEPTION 'A reviewed capital account statement cannot be changed.';
  END IF;
  IF OLD.notified_at IS NOT NULL AND NEW.notified_at IS DISTINCT FROM OLD.notified_at THEN
    RAISE EXCEPTION 'The investor notice is already recorded.';
  END IF;
  IF NEW.notified_at IS NOT NULL AND OLD.notified_at IS NULL AND NEW.review_status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved statement can be sent to the investor.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_capital_statement_review ON public.capital_account_statements;
CREATE TRIGGER trg_protect_capital_statement_review BEFORE UPDATE ON public.capital_account_statements
  FOR EACH ROW EXECUTE FUNCTION public.protect_capital_statement_review();

DROP POLICY IF EXISTS "Investors read their own capital statements" ON public.capital_account_statements;
CREATE POLICY "Investors read their own approved capital statements" ON public.capital_account_statements
  FOR SELECT TO authenticated
  USING (review_status = 'approved' AND EXISTS (SELECT 1 FROM public.investor_applications a WHERE a.id = capital_account_statements.application_id AND a.user_id = auth.uid()));

CREATE TABLE public.financial_review_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  report_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','returned')),
  prepared_by uuid NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  notified_at timestamptz,
  notified_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);
GRANT ALL ON public.financial_review_memos TO service_role;
ALTER TABLE public.financial_review_memos ENABLE ROW LEVEL SECURITY;
CREATE INDEX financial_review_memos_offering_idx ON public.financial_review_memos(offering_id, period_end DESC);

CREATE OR REPLACE FUNCTION public.protect_financial_review_memo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Financial review memos are never deleted.';
  END IF;
  IF OLD.status <> 'draft' THEN
    IF NEW.title IS DISTINCT FROM OLD.title OR NEW.summary IS DISTINCT FROM OLD.summary OR NEW.findings IS DISTINCT FROM OLD.findings
       OR NEW.report_ids IS DISTINCT FROM OLD.report_ids OR NEW.status IS DISTINCT FROM OLD.status OR NEW.decided_by IS DISTINCT FROM OLD.decided_by
       OR NEW.period_start IS DISTINCT FROM OLD.period_start OR NEW.period_end IS DISTINCT FROM OLD.period_end THEN
      RAISE EXCEPTION 'A decided review memo cannot be changed; start a new memo.';
    END IF;
    IF OLD.notified_at IS NOT NULL AND NEW.notified_at IS DISTINCT FROM OLD.notified_at THEN
      RAISE EXCEPTION 'The client notice is already recorded.';
    END IF;
    IF NEW.notified_at IS NOT NULL AND OLD.status <> 'approved' THEN
      RAISE EXCEPTION 'Only an approved memo can be sent.';
    END IF;
  ELSIF NEW.status <> 'draft' THEN
    IF NEW.decided_by IS NULL OR NEW.decided_by = OLD.prepared_by THEN
      RAISE EXCEPTION 'A review memo must be decided by someone other than its preparer.';
    END IF;
    IF NEW.status = 'returned' AND coalesce(length(trim(NEW.decision_note)),0) = 0 THEN
      RAISE EXCEPTION 'Returning a memo needs a note.';
    END IF;
  ELSIF NEW.notified_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only an approved memo can be sent.';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_protect_financial_review_memo BEFORE UPDATE OR DELETE ON public.financial_review_memos
  FOR EACH ROW EXECUTE FUNCTION public.protect_financial_review_memo();