CREATE TABLE public.fund_manager_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('fund_details','fees_team','bank','document')),
  doc_kind text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  file_path text,
  file_name text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','returned','withdrawn')),
  submitted_by uuid NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text
);
CREATE INDEX fund_manager_submissions_offering_idx ON public.fund_manager_submissions(offering_id, status);
GRANT ALL ON public.fund_manager_submissions TO service_role;
ALTER TABLE public.fund_manager_submissions ENABLE ROW LEVEL SECURITY;
-- No client policies: reachable only through server functions that check staff or that fund's manager.