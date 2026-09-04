ALTER TABLE public.investor_emails
  ADD COLUMN IF NOT EXISTS delivery_event text,
  ADD COLUMN IF NOT EXISTS delivery_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_detail text;

CREATE INDEX IF NOT EXISTS investor_emails_to_email_idx ON public.investor_emails (to_email, created_at DESC);

CREATE TABLE IF NOT EXISTS public.email_delivery_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  recipient text NOT NULL,
  message_id text,
  investor_email_id uuid REFERENCES public.investor_emails(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_delivery_events TO authenticated;
GRANT ALL ON public.email_delivery_events TO service_role;

ALTER TABLE public.email_delivery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read email delivery events"
  ON public.email_delivery_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS email_delivery_events_recipient_idx
  ON public.email_delivery_events (recipient, received_at DESC);