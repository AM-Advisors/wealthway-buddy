CREATE TABLE public.fund_onboarding_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','superseded')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  disabled_at timestamptz,
  last_used_at timestamptz
);
CREATE UNIQUE INDEX fund_onboarding_links_one_current ON public.fund_onboarding_links (offering_id) WHERE status IN ('active','disabled');
GRANT ALL ON public.fund_onboarding_links TO service_role;
ALTER TABLE public.fund_onboarding_links ENABLE ROW LEVEL SECURITY;

-- Attribution only: no personal data, one row per onboarding.
CREATE TABLE public.fund_onboarding_link_starts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.fund_onboarding_links(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL,
  onboarding_id uuid NOT NULL UNIQUE REFERENCES public.investor_onboardings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_onboarding_link_starts TO service_role;
ALTER TABLE public.fund_onboarding_link_starts ENABLE ROW LEVEL SECURITY;

-- Abuse protection: hashed caller key only, pruned by age.
CREATE TABLE public.fund_onboarding_link_attempts (
  id bigserial PRIMARY KEY,
  caller_hash text NOT NULL,
  ok boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fund_onboarding_link_attempts_caller ON public.fund_onboarding_link_attempts (caller_hash, created_at DESC);
GRANT ALL ON public.fund_onboarding_link_attempts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.fund_onboarding_link_attempts_id_seq TO service_role;
ALTER TABLE public.fund_onboarding_link_attempts ENABLE ROW LEVEL SECURITY;

-- Retry safety: at most one open, not-yet-profiled onboarding per fund and person.
CREATE UNIQUE INDEX investor_onboardings_one_open_unprofiled
  ON public.investor_onboardings (offering_id, investor_user_id)
  WHERE investment_profile_id IS NULL AND stage NOT IN ('closed','declined','cancelled');