CREATE TABLE public.client_dashboard_prefs (
  user_id uuid NOT NULL,
  client_id uuid NOT NULL,
  layout jsonb NOT NULL DEFAULT '[]'::jsonb,
  hidden jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_period text NOT NULL DEFAULT 'month',
  default_fund_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_dashboard_prefs TO authenticated;
GRANT ALL ON public.client_dashboard_prefs TO service_role;
ALTER TABLE public.client_dashboard_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own dashboard prefs" ON public.client_dashboard_prefs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.client_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  path text,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX client_notifications_dedupe ON public.client_notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX client_notifications_user ON public.client_notifications (user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.client_notifications TO authenticated;
GRANT ALL ON public.client_notifications TO service_role;
ALTER TABLE public.client_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own notifications" ON public.client_notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Mark own notifications read" ON public.client_notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);