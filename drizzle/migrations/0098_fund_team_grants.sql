CREATE TYPE public.fund_team_role AS ENUM ('fund_viewer','fund_assistant');

CREATE TABLE public.fund_team_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  grantee_user_id uuid,
  grantee_email text NOT NULL,
  role public.fund_team_role NOT NULL,
  granted_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','needs_review')),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fund_team_grants_one_active ON public.fund_team_grants (offering_id, lower(grantee_email)) WHERE status = 'active';
GRANT SELECT ON public.fund_team_grants TO authenticated;
GRANT ALL ON public.fund_team_grants TO service_role;
ALTER TABLE public.fund_team_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Grantee reads own fund team grants" ON public.fund_team_grants FOR SELECT TO authenticated USING (grantee_user_id = auth.uid());
CREATE POLICY "Managers read their fund team grants" ON public.fund_team_grants FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = fund_team_grants.offering_id AND fm.user_id = auth.uid()));

CREATE TABLE public.fund_team_grant_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL REFERENCES public.fund_team_grants(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL,
  event text NOT NULL,
  actor_user_id uuid,
  before_role text,
  after_role text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fund_team_grant_events TO authenticated;
GRANT ALL ON public.fund_team_grant_events TO service_role;
ALTER TABLE public.fund_team_grant_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read their fund team events" ON public.fund_team_grant_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = fund_team_grant_events.offering_id AND fm.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.block_fund_team_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'fund_team_grant_events is append-only'; END; $$;
CREATE TRIGGER fund_team_grant_events_append_only BEFORE UPDATE OR DELETE ON public.fund_team_grant_events FOR EACH ROW EXECUTE FUNCTION public.block_fund_team_event_mutation();