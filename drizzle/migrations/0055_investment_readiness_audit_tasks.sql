CREATE TABLE public.investment_readiness_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL,
  offering_id uuid,
  investment_profile_id uuid,
  requirement_key text NOT NULL,
  stage text NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  source_system text,
  reason text,
  changed_by uuid,
  automatic boolean NOT NULL DEFAULT true,
  rule_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.investment_readiness_events TO service_role;
ALTER TABLE public.investment_readiness_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX investment_readiness_events_onb ON public.investment_readiness_events(onboarding_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.block_readiness_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'investment_readiness_events is append-only'; END $$;
CREATE TRIGGER investment_readiness_events_append_only BEFORE UPDATE OR DELETE ON public.investment_readiness_events
FOR EACH ROW EXECUTE FUNCTION public.block_readiness_event_mutation();

CREATE TABLE public.investment_readiness_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL,
  offering_id uuid,
  requirement_key text NOT NULL,
  title text NOT NULL,
  owner text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  rule_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT ALL ON public.investment_readiness_tasks TO service_role;
ALTER TABLE public.investment_readiness_tasks ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX investment_readiness_tasks_one_open ON public.investment_readiness_tasks(onboarding_id, requirement_key) WHERE status = 'open';
CREATE INDEX investment_readiness_tasks_owner ON public.investment_readiness_tasks(owner, status);