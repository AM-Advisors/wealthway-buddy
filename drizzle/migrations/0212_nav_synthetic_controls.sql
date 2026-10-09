ALTER TABLE public.nav_versions
  ADD COLUMN IF NOT EXISTS synthetic_classification text,
  ADD COLUMN IF NOT EXISTS approval_scope text;

ALTER TABLE public.nav_versions
  ADD CONSTRAINT nav_versions_approval_scope_chk
  CHECK (approval_scope IS NULL OR approval_scope IN ('production','internal_synthetic_only'));

COMMENT ON COLUMN public.nav_versions.synthetic_classification IS
  'Set when any valuation used is a synthetic assumption. Synthetic NAV can never be published, distributed or reported.';

CREATE OR REPLACE FUNCTION public.guard_synthetic_nav()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _synthetic boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(NEW.valuation_versions, '[]'::jsonb)) e
    JOIN public.portfolio_valuations v ON v.id::text = e->>'valuationId'
    WHERE v.evidence_basis = 'synthetic_assumption'
  ) INTO _synthetic;
  IF _synthetic THEN
    NEW.synthetic_classification := 'DEMO / SYNTHETIC — UNAUDITED — VALUATIONS NOT INDEPENDENTLY VERIFIED';
  ELSIF TG_OP = 'UPDATE' AND OLD.synthetic_classification IS NOT NULL THEN
    NEW.synthetic_classification := OLD.synthetic_classification; -- never cleared
  END IF;
  IF NEW.synthetic_classification IS NOT NULL THEN
    IF NEW.status::text IN ('published','superseded') THEN
      RAISE EXCEPTION 'Synthetic NAV cannot be published, distributed or used for regulatory reporting.';
    END IF;
    IF NEW.status::text = 'approved' THEN
      NEW.approval_scope := 'internal_synthetic_only';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_synthetic_nav ON public.nav_versions;
CREATE TRIGGER trg_guard_synthetic_nav
  BEFORE INSERT OR UPDATE ON public.nav_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_synthetic_nav();

CREATE OR REPLACE FUNCTION public.guard_synthetic_nav_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.nav_version_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.nav_versions n WHERE n.id = NEW.nav_version_id AND n.synthetic_classification IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Synthetic NAV cannot be registered as a financial report.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_synthetic_nav_report ON public.financial_reports;
CREATE TRIGGER trg_guard_synthetic_nav_report
  BEFORE INSERT OR UPDATE ON public.financial_reports
  FOR EACH ROW EXECUTE FUNCTION public.guard_synthetic_nav_report();