ALTER TABLE public.client_contacts
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_invited_by uuid,
  ADD COLUMN IF NOT EXISTS invite_cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

CREATE TABLE public.client_contact_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.client_contacts(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  actor_id uuid,
  event_kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.client_contact_events TO service_role;
ALTER TABLE public.client_contact_events ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.client_contact_events IS 'Append-only; read and written only through server functions after role checks.';
CREATE INDEX client_contact_events_contact_idx ON public.client_contact_events(contact_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.client_contact_events_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'client_contact_events is append-only'; END $$;
CREATE TRIGGER client_contact_events_no_mutation BEFORE UPDATE OR DELETE ON public.client_contact_events
  FOR EACH ROW EXECUTE FUNCTION public.client_contact_events_append_only();

DROP POLICY IF EXISTS "Public read client branding files" ON storage.objects;