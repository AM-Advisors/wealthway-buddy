CREATE TABLE public.onboarding_readiness_summaries (
  onboarding_id uuid PRIMARY KEY REFERENCES public.investor_onboardings(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL,
  close_ready boolean NOT NULL DEFAULT false,
  terminal text,
  blocked boolean NOT NULL DEFAULT false,
  next_owner text,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX onboarding_readiness_summaries_offering ON public.onboarding_readiness_summaries(offering_id);
GRANT ALL ON public.onboarding_readiness_summaries TO service_role;
ALTER TABLE public.onboarding_readiness_summaries ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.onboarding_readiness_summaries IS 'Derived cache of computeReadiness results for staff dashboards; server-only, rebuilt from canonical records.';