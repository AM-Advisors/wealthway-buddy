-- Step 5: financial statements, trial balance, GL reporting, workpapers.
-- Additive only: nothing existing is dropped, renamed or retyped.

ALTER TYPE report_status ADD VALUE IF NOT EXISTS 'prepared' AFTER 'draft';

-- ------------------------------------------------- statement mapping versions
CREATE TABLE IF NOT EXISTS public.statement_mapping_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES public.ledger_books(id) ON DELETE CASCADE,
  offering_id UUID REFERENCES public.offerings(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Default mapping',
  basis TEXT NOT NULL DEFAULT 'accrual',
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  presentation JSONB NOT NULL DEFAULT '{}'::jsonb,
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  effective_from DATE,
  created_by UUID,
  activated_by UUID,
  activated_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS statement_mapping_versions_book_idx
  ON public.statement_mapping_versions (book_id, basis, version DESC);
GRANT SELECT, INSERT, UPDATE ON public.statement_mapping_versions TO authenticated;
GRANT ALL ON public.statement_mapping_versions TO service_role;
ALTER TABLE public.statement_mapping_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read statement mappings" ON public.statement_mapping_versions
  FOR SELECT TO authenticated USING (public.can_review_operations() OR public.is_any_staff());

-- ------------------------------------------------------------- report lines
CREATE TABLE IF NOT EXISTS public.report_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.financial_reports(id) ON DELETE CASCADE,
  statement TEXT NOT NULL,
  section TEXT,
  line_key TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  amount_cents BIGINT NOT NULL DEFAULT 0,
  comparative_cents BIGINT,
  is_total BOOLEAN NOT NULL DEFAULT false,
  account_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_lines_report_idx ON public.report_lines (report_id, statement, sort_order);
GRANT SELECT ON public.report_lines TO authenticated;
GRANT ALL ON public.report_lines TO service_role;
ALTER TABLE public.report_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read report lines" ON public.report_lines
  FOR SELECT TO authenticated USING (public.can_review_operations() OR public.is_any_staff());

-- A published report's lines are evidence: never rewritten, never removed.
CREATE OR REPLACE FUNCTION public.protect_published_report_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_status report_status;
BEGIN
  SELECT status INTO parent_status FROM public.financial_reports
   WHERE id = COALESCE(NEW.report_id, OLD.report_id);
  IF parent_status IN ('published', 'superseded') THEN
    RAISE EXCEPTION 'Published report lines cannot be changed; publish a superseding version.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS protect_published_report_lines ON public.report_lines;
CREATE TRIGGER protect_published_report_lines
  BEFORE INSERT OR UPDATE OR DELETE ON public.report_lines
  FOR EACH ROW EXECUTE FUNCTION public.protect_published_report_lines();

-- -------------------------------------------------------- report exceptions
CREATE TABLE IF NOT EXISTS public.report_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES public.financial_reports(id) ON DELETE CASCADE,
  book_id UUID REFERENCES public.ledger_books(id) ON DELETE CASCADE,
  offering_id UUID REFERENCES public.offerings(id) ON DELETE CASCADE,
  period_end DATE,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'blocking',
  detail TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_exceptions_fund_idx ON public.report_exceptions (offering_id, status, period_end DESC);
GRANT SELECT ON public.report_exceptions TO authenticated;
GRANT ALL ON public.report_exceptions TO service_role;
ALTER TABLE public.report_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read report exceptions" ON public.report_exceptions
  FOR SELECT TO authenticated USING (public.can_review_operations() OR public.is_any_staff());

-- ------------------------------------------------------------- workpapers
CREATE TABLE IF NOT EXISTS public.accounting_workpapers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES public.ledger_books(id) ON DELETE CASCADE,
  offering_id UUID REFERENCES public.offerings(id) ON DELETE CASCADE,
  period_id UUID REFERENCES public.accounting_periods(id) ON DELETE SET NULL,
  period_start DATE,
  period_end DATE NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  figures JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_records JSONB NOT NULL DEFAULT '[]'::jsonb,
  exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  support JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT,
  prepared_by UUID,
  prepared_at TIMESTAMPTZ,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  signed_off_by UUID,
  signed_off_at TIMESTAMPTZ,
  shared_with_manager BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS accounting_workpapers_unique_idx
  ON public.accounting_workpapers (book_id, period_end, kind);
GRANT SELECT ON public.accounting_workpapers TO authenticated;
GRANT ALL ON public.accounting_workpapers TO service_role;
ALTER TABLE public.accounting_workpapers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read workpapers" ON public.accounting_workpapers
  FOR SELECT TO authenticated USING (public.can_review_operations() OR public.is_any_staff());

-- --------------------------------------------------------- close checklist
CREATE TABLE IF NOT EXISTS public.close_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES public.ledger_books(id) ON DELETE CASCADE,
  offering_id UUID REFERENCES public.offerings(id) ON DELETE CASCADE,
  period_id UUID REFERENCES public.accounting_periods(id) ON DELETE SET NULL,
  period_end DATE NOT NULL,
  item_key TEXT NOT NULL,
  label TEXT NOT NULL,
  blocking BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'pending',
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_by UUID,
  completed_at TIMESTAMPTZ,
  waived_by UUID,
  waived_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS close_checklist_unique_idx
  ON public.close_checklist_items (book_id, period_end, item_key);
GRANT SELECT ON public.close_checklist_items TO authenticated;
GRANT ALL ON public.close_checklist_items TO service_role;
ALTER TABLE public.close_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read close checklist" ON public.close_checklist_items
  FOR SELECT TO authenticated USING (public.can_review_operations() OR public.is_any_staff());

-- ---------------------------------------------------------- report packages
CREATE TABLE IF NOT EXISTS public.report_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID REFERENCES public.offerings(id) ON DELETE CASCADE,
  book_id UUID REFERENCES public.ledger_books(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  package_type TEXT NOT NULL DEFAULT 'custom',
  audience TEXT NOT NULL DEFAULT 'harmonious',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.report_packages TO authenticated;
GRANT ALL ON public.report_packages TO service_role;
ALTER TABLE public.report_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read report packages" ON public.report_packages
  FOR SELECT TO authenticated USING (public.can_review_operations() OR public.is_any_staff());

CREATE TABLE IF NOT EXISTS public.report_package_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID REFERENCES public.report_packages(id) ON DELETE SET NULL,
  offering_id UUID REFERENCES public.offerings(id) ON DELETE CASCADE,
  book_id UUID REFERENCES public.ledger_books(id) ON DELETE CASCADE,
  period_end DATE NOT NULL,
  period_start DATE,
  audience TEXT NOT NULL DEFAULT 'harmonious',
  status TEXT NOT NULL DEFAULT 'draft',
  manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  report_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  prepared_by UUID,
  prepared_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  published_by UUID,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_package_runs_fund_idx ON public.report_package_runs (offering_id, period_end DESC);
GRANT SELECT ON public.report_package_runs TO authenticated;
GRANT ALL ON public.report_package_runs TO service_role;
ALTER TABLE public.report_package_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read report package runs" ON public.report_package_runs
  FOR SELECT TO authenticated USING (public.can_review_operations() OR public.is_any_staff());

-- ------------------------------------------- financial_reports provenance
ALTER TABLE public.financial_reports
  ADD COLUMN IF NOT EXISTS basis TEXT NOT NULL DEFAULT 'accrual',
  ADD COLUMN IF NOT EXISTS mapping_version_id UUID REFERENCES public.statement_mapping_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mapping_version INTEGER,
  ADD COLUMN IF NOT EXISTS gl_cutoff_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS allocation_run_id UUID REFERENCES public.allocation_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valuation_versions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS comparatives JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reconciliations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS close_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS investor_visible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manager_visible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manager_response TEXT,
  ADD COLUMN IF NOT EXISTS manager_note TEXT,
  ADD COLUMN IF NOT EXISTS manager_responded_by UUID,
  ADD COLUMN IF NOT EXISTS manager_responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prepared_by UUID,
  ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS package_run_id UUID REFERENCES public.report_package_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_reason TEXT;

-- Managers read published financials for funds they manage; investors read
-- only reports approved for investor publication and attributed to them.
DROP POLICY IF EXISTS "managers read published fund financials" ON public.financial_reports;
CREATE POLICY "managers read published fund financials" ON public.financial_reports
  FOR SELECT TO authenticated
  USING (
    status IN ('published', 'superseded')
    AND manager_visible
    AND offering_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.fund_managers fm
       WHERE fm.offering_id = financial_reports.offering_id
         AND fm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "investors read their published fund financials" ON public.financial_reports;
CREATE POLICY "investors read their published fund financials" ON public.financial_reports
  FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND investor_visible
    AND offering_id IS NOT NULL
    AND (
      subject_user_id = auth.uid()
      OR (
        subject_user_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.investor_positions ip
           WHERE ip.offering_id = financial_reports.offering_id
             AND ip.investor_user_id = auth.uid()
        )
      )
    )
  );
