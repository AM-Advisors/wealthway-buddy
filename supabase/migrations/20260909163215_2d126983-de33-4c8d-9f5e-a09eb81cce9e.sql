CREATE TABLE public.onboarding_step_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.investor_applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  step text NOT NULL,
  view_count integer NOT NULL DEFAULT 1,
  first_viewed_at timestamptz NOT NULL DEFAULT now(),
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, step)
);

GRANT SELECT, INSERT, UPDATE ON public.onboarding_step_views TO authenticated;
GRANT ALL ON public.onboarding_step_views TO service_role;

ALTER TABLE public.onboarding_step_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Investors record their own step opens"
ON public.onboarding_step_views FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Investors update their own step opens"
ON public.onboarding_step_views FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Investors read their own step opens"
ON public.onboarding_step_views FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Reviewers read step opens for their funds"
ON public.onboarding_step_views FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
  )
  OR EXISTS (
    SELECT 1 FROM public.fund_managers fm
    WHERE fm.offering_id = onboarding_step_views.offering_id
      AND fm.user_id = auth.uid()
  )
);

CREATE INDEX idx_onboarding_step_views_offering ON public.onboarding_step_views(offering_id, step);
CREATE INDEX idx_onboarding_step_views_application ON public.onboarding_step_views(application_id);

CREATE TRIGGER set_onboarding_step_views_updated_at
BEFORE UPDATE ON public.onboarding_step_views
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();