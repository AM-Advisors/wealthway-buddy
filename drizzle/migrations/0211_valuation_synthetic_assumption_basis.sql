ALTER TABLE public.portfolio_valuations
  ADD COLUMN IF NOT EXISTS evidence_basis text NOT NULL DEFAULT 'supporting_evidence',
  ADD COLUMN IF NOT EXISTS synthetic_assumption_reference text;

ALTER TABLE public.portfolio_valuations
  ADD CONSTRAINT portfolio_valuations_evidence_basis_chk
  CHECK (evidence_basis IN ('supporting_evidence','synthetic_assumption'));

ALTER TABLE public.portfolio_valuations
  ADD CONSTRAINT portfolio_valuations_synthetic_ref_chk
  CHECK (evidence_basis <> 'synthetic_assumption' OR length(coalesce(synthetic_assumption_reference,'')) >= 10);

COMMENT ON COLUMN public.portfolio_valuations.evidence_basis IS
  'supporting_evidence (production) or synthetic_assumption (DEMO / SYNTHETIC ASSUMPTION; isolated test/demo funds only, never satisfies production evidence).';

CREATE OR REPLACE FUNCTION public.guard_valuation_evidence_basis()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _demo boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.evidence_basis IS DISTINCT FROM OLD.evidence_basis THEN
    RAISE EXCEPTION 'A valuation''s evidence basis is fixed when it is proposed; record a new version instead.';
  END IF;
  IF NEW.evidence_basis = 'synthetic_assumption' THEN
    SELECT coalesce(c.is_test_demo, false) INTO _demo
      FROM public.offerings o LEFT JOIN public.clients c ON c.id = o.client_id
     WHERE o.id = NEW.offering_id;
    IF NOT coalesce(_demo, false) THEN
      RAISE EXCEPTION 'Synthetic valuation assumptions are allowed only on isolated TEST/DEMO funds.';
    END IF;
    IF NEW.evidence_waived_by IS NOT NULL THEN
      RAISE EXCEPTION 'A synthetic assumption cannot be combined with an evidence waiver.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_valuation_evidence_basis ON public.portfolio_valuations;
CREATE TRIGGER trg_guard_valuation_evidence_basis
  BEFORE INSERT OR UPDATE ON public.portfolio_valuations
  FOR EACH ROW EXECUTE FUNCTION public.guard_valuation_evidence_basis();

CREATE OR REPLACE FUNCTION public.guard_synthetic_valuation_evidence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.portfolio_valuations v WHERE v.id = NEW.valuation_id AND v.evidence_basis = 'synthetic_assumption') THEN
    RAISE EXCEPTION 'Supporting evidence cannot be attached to a synthetic-assumption valuation; propose a new evidence-backed version.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_synthetic_valuation_evidence ON public.valuation_evidence;
CREATE TRIGGER trg_guard_synthetic_valuation_evidence
  BEFORE INSERT ON public.valuation_evidence
  FOR EACH ROW EXECUTE FUNCTION public.guard_synthetic_valuation_evidence();

CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_one_live_valuation_journal
  ON public.journal_entries (source_table, source_id)
  WHERE source_table = 'portfolio_valuations' AND status NOT IN ('voided','reversed');