CREATE TABLE public.client_team_assignments (
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  team_role text NOT NULL CHECK (team_role IN ('sales','account_manager','operations')),
  user_id uuid NOT NULL,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, team_role)
);
CREATE TABLE public.fund_team_overrides (
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  team_role text NOT NULL CHECK (team_role IN ('sales','account_manager','operations')),
  user_id uuid NOT NULL,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (offering_id, team_role)
);
CREATE TABLE public.team_assignment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('client','fund')),
  client_id uuid,
  offering_id uuid,
  team_role text NOT NULL,
  prior_user_id uuid,
  new_user_id uuid,
  prior_source text,
  new_source text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_assignment_events_client_idx ON public.team_assignment_events(client_id, created_at DESC);
CREATE INDEX team_assignment_events_fund_idx ON public.team_assignment_events(offering_id, created_at DESC);
CREATE INDEX client_team_user_idx ON public.client_team_assignments(user_id);
CREATE INDEX fund_team_user_idx ON public.fund_team_overrides(user_id);

GRANT ALL ON public.client_team_assignments TO service_role;
GRANT ALL ON public.fund_team_overrides TO service_role;
GRANT ALL ON public.team_assignment_events TO service_role;
ALTER TABLE public.client_team_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_team_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_assignment_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_team_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Team assignment history is append-only'; END $$;
CREATE TRIGGER team_assignment_events_append_only BEFORE UPDATE OR DELETE ON public.team_assignment_events
FOR EACH ROW EXECUTE FUNCTION public.block_team_event_mutation();