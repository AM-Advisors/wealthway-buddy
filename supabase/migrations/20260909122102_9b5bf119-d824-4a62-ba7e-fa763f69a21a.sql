CREATE TABLE public.reviewer_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  application_id uuid REFERENCES public.investor_applications(id) ON DELETE SET NULL,
  action text NOT NULL,
  area text,
  outcome text,
  summary text NOT NULL,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.reviewer_activity TO authenticated;
GRANT ALL ON public.reviewer_activity TO service_role;

ALTER TABLE public.reviewer_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviewers log their own actions"
ON public.reviewer_activity FOR INSERT TO authenticated
WITH CHECK (
  actor_id = auth.uid()
  AND (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'fund_manager'::app_role))
);

CREATE POLICY "Reviewers read scoped activity"
ON public.reviewer_activity FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR actor_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.fund_managers fm
    WHERE fm.user_id = auth.uid() AND fm.offering_id = reviewer_activity.offering_id
  )
);

CREATE INDEX reviewer_activity_created_idx ON public.reviewer_activity (created_at DESC);
CREATE INDEX reviewer_activity_actor_idx ON public.reviewer_activity (actor_id, created_at DESC);
CREATE INDEX reviewer_activity_offering_idx ON public.reviewer_activity (offering_id, created_at DESC);