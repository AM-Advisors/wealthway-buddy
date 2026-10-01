CREATE TABLE public.screen_protection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  event_type text NOT NULL CHECK (event_type IN ('tab_hidden','window_blur','print_screen','print_attempt','copy_attempt','save_attempt','context_menu')),
  path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.screen_protection_events TO authenticated;
GRANT ALL ON public.screen_protection_events TO service_role;
ALTER TABLE public.screen_protection_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert own protection events" ON public.screen_protection_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "platform admins read protection events" ON public.screen_protection_events FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE INDEX screen_protection_events_created_idx ON public.screen_protection_events (created_at DESC);
CREATE OR REPLACE FUNCTION public.block_screen_protection_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN RAISE EXCEPTION 'screen_protection_events is append-only'; END $$;
CREATE TRIGGER screen_protection_events_append_only BEFORE UPDATE OR DELETE ON public.screen_protection_events FOR EACH ROW EXECUTE FUNCTION public.block_screen_protection_mutation();