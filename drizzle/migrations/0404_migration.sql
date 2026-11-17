CREATE TABLE public.client_tab_access (
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tab_key text NOT NULL,
  enabled boolean NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, tab_key)
);
CREATE TABLE public.client_tab_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tab_key text NOT NULL,
  enabled boolean NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.client_tab_access, public.client_tab_access_events TO authenticated;
GRANT ALL ON public.client_tab_access, public.client_tab_access_events TO service_role;
ALTER TABLE public.client_tab_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_tab_access_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client members read own tab access" ON public.client_tab_access FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = client_tab_access.client_id AND cu.user_id = auth.uid() AND cu.revoked_at IS NULL));
CREATE OR REPLACE FUNCTION public.block_client_tab_access_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Access change history cannot be edited'; END $$;
CREATE TRIGGER client_tab_access_events_append_only BEFORE UPDATE OR DELETE ON public.client_tab_access_events
  FOR EACH ROW EXECUTE FUNCTION public.block_client_tab_access_event_mutation();