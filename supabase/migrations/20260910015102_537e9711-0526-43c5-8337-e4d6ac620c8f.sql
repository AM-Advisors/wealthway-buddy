ALTER TABLE public.offboarding_cases
  ADD COLUMN IF NOT EXISTS initiated_by text NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS closed_by uuid,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE POLICY "retention readable by client" ON public.record_retention
  FOR SELECT TO authenticated
  USING (client_id IS NOT NULL AND private.client_visible(auth.uid(), client_id));