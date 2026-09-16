CREATE TABLE public.ct_concierge_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_id uuid NOT NULL UNIQUE REFERENCES public.ct_migrations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'received',
  assigned_to uuid,
  assigned_at timestamptz,
  target_date date,
  priority text NOT NULL DEFAULT 'standard',
  founder_note text,
  contact_name text,
  contact_email text,
  prepared_summary jsonb,
  sent_for_review_at timestamptz,
  review_status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  recorded_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ct_concierge_cases_stage_check CHECK (stage IN ('received','assigned','preparing','awaiting_founder','founder_review','recorded','cancelled')),
  CONSTRAINT ct_concierge_cases_priority_check CHECK (priority IN ('standard','urgent')),
  CONSTRAINT ct_concierge_cases_review_check CHECK (review_status IN ('pending','approved','changes_requested'))
);

CREATE INDEX ct_concierge_cases_company_idx ON public.ct_concierge_cases(company_id);
CREATE INDEX ct_concierge_cases_stage_idx ON public.ct_concierge_cases(stage);
CREATE INDEX ct_concierge_cases_assigned_idx ON public.ct_concierge_cases(assigned_to);

GRANT SELECT, INSERT, UPDATE ON public.ct_concierge_cases TO authenticated;
GRANT ALL ON public.ct_concierge_cases TO service_role;
ALTER TABLE public.ct_concierge_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage concierge cases"
  ON public.ct_concierge_cases FOR ALL TO authenticated
  USING (public.ct_is_staff())
  WITH CHECK (public.ct_is_staff());

CREATE POLICY "Company can view its concierge case"
  ON public.ct_concierge_cases FOR SELECT TO authenticated
  USING (public.ct_can_view(company_id));

CREATE POLICY "Company can open a concierge case"
  ON public.ct_concierge_cases FOR INSERT TO authenticated
  WITH CHECK (public.ct_can_manage(company_id));

CREATE POLICY "Company can record its review decision"
  ON public.ct_concierge_cases FOR UPDATE TO authenticated
  USING (public.ct_can_manage(company_id))
  WITH CHECK (public.ct_can_manage(company_id));

CREATE TRIGGER ct_concierge_cases_updated_at
  BEFORE UPDATE ON public.ct_concierge_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ct_concierge_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.ct_concierge_cases(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  migration_row_id uuid REFERENCES public.ct_migration_rows(id) ON DELETE SET NULL,
  question text NOT NULL,
  detail text,
  status text NOT NULL DEFAULT 'open',
  founder_response text,
  responded_by uuid,
  responded_at timestamptz,
  resolved_by uuid,
  resolved_at timestamptz,
  raised_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ct_concierge_exceptions_status_check CHECK (status IN ('open','answered','resolved'))
);

CREATE INDEX ct_concierge_exceptions_case_idx ON public.ct_concierge_exceptions(case_id);

GRANT SELECT, INSERT, UPDATE ON public.ct_concierge_exceptions TO authenticated;
GRANT ALL ON public.ct_concierge_exceptions TO service_role;
ALTER TABLE public.ct_concierge_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage concierge questions"
  ON public.ct_concierge_exceptions FOR ALL TO authenticated
  USING (public.ct_is_staff())
  WITH CHECK (public.ct_is_staff());

CREATE POLICY "Company can view its concierge questions"
  ON public.ct_concierge_exceptions FOR SELECT TO authenticated
  USING (public.ct_can_view(company_id));

CREATE POLICY "Company can answer its concierge questions"
  ON public.ct_concierge_exceptions FOR UPDATE TO authenticated
  USING (public.ct_can_manage(company_id))
  WITH CHECK (public.ct_can_manage(company_id));

CREATE TRIGGER ct_concierge_exceptions_updated_at
  BEFORE UPDATE ON public.ct_concierge_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ct_concierge_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.ct_concierge_cases(id) ON DELETE CASCADE,
  author_id uuid,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ct_concierge_notes_case_idx ON public.ct_concierge_notes(case_id);

GRANT SELECT, INSERT ON public.ct_concierge_notes TO authenticated;
GRANT ALL ON public.ct_concierge_notes TO service_role;
ALTER TABLE public.ct_concierge_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage concierge notes"
  ON public.ct_concierge_notes FOR ALL TO authenticated
  USING (public.ct_is_staff())
  WITH CHECK (public.ct_is_staff());