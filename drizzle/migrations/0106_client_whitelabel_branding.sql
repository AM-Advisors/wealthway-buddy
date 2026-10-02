CREATE TABLE public.client_branding (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  whitelabel_status text NOT NULL DEFAULT 'off' CHECK (whitelabel_status IN ('off','payment_pending','active_paid','unlocked_free')),
  monthly_fee_cents integer NOT NULL DEFAULT 10000,
  unlocked_by uuid,
  unlocked_at timestamptz,
  logo_path text,
  heading_font text,
  body_font text,
  primary_color text CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  subdomain text UNIQUE CHECK (subdomain IS NULL OR subdomain ~ '^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$'),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.client_branding TO authenticated;
GRANT ALL ON public.client_branding TO service_role;
ALTER TABLE public.client_branding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members and staff read branding" ON public.client_branding FOR SELECT TO authenticated
  USING (public.is_any_staff() OR public.is_client_member(client_id));

CREATE TABLE public.client_branding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  actor_id uuid,
  event_kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.client_branding_events TO authenticated;
GRANT ALL ON public.client_branding_events TO service_role;
ALTER TABLE public.client_branding_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read branding events" ON public.client_branding_events FOR SELECT TO authenticated
  USING (public.is_any_staff());

CREATE OR REPLACE FUNCTION public.client_branding_events_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Branding history is append-only'; END $$;
CREATE TRIGGER client_branding_events_no_change BEFORE UPDATE OR DELETE ON public.client_branding_events
  FOR EACH ROW EXECUTE FUNCTION public.client_branding_events_append_only();

CREATE POLICY "Public read client branding files" ON storage.objects FOR SELECT
  USING (bucket_id = 'client-branding');