ALTER TABLE public.marketing_post_targets DROP CONSTRAINT marketing_post_targets_status_check;
ALTER TABLE public.marketing_post_targets ADD CONSTRAINT marketing_post_targets_status_check CHECK (status = ANY (ARRAY['pending','publishing','submitted','published','failed','test_passed','blocked']));

CREATE TABLE public.marketing_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key text NOT NULL,
  slot_key text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('scheduled','running','completed','partial','failed','missed','skipped','blocked')),
  started_at timestamptz,
  finished_at timestamptz,
  failed_stage text,
  error text,
  result jsonb,
  catch_up boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_key, slot_key)
);
GRANT SELECT ON public.marketing_job_runs TO authenticated;
GRANT ALL ON public.marketing_job_runs TO service_role;
ALTER TABLE public.marketing_job_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Marketing staff read job runs" ON public.marketing_job_runs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role::text IN ('super_admin','admin','marketing','marketing_manager','executive','executive_approver')));
CREATE INDEX marketing_job_runs_job_idx ON public.marketing_job_runs (job_key, created_at DESC);