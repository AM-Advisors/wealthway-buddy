CREATE TABLE IF NOT EXISTS public.scheduled_job_runs (
  job_key text PRIMARY KEY,
  last_run_on date NOT NULL,
  last_run_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.scheduled_job_runs TO service_role;

ALTER TABLE public.scheduled_job_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view scheduled job runs" ON public.scheduled_job_runs;

CREATE POLICY "Staff can view scheduled job runs"
ON public.scheduled_job_runs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text IN ('admin','super_admin','operations','legal','compliance','finance','client_success','executive')
  )
);