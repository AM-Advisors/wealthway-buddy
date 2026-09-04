CREATE TABLE public.didit_webhook_events (
  event_id text PRIMARY KEY,
  webhook_type text NOT NULL,
  session_id text,
  status text,
  application_id uuid REFERENCES public.investor_applications(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone,
  error text
);

GRANT SELECT ON public.didit_webhook_events TO authenticated;
GRANT ALL ON public.didit_webhook_events TO service_role;

ALTER TABLE public.didit_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read didit events"
  ON public.didit_webhook_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX didit_webhook_events_application_idx ON public.didit_webhook_events(application_id, received_at DESC);
CREATE INDEX didit_webhook_events_session_idx ON public.didit_webhook_events(session_id);

ALTER TABLE public.kyc_verifications
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS vendor_data text,
  ADD COLUMN IF NOT EXISTS decision jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS expired_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS kyc_verifications_session_idx ON public.kyc_verifications(session_id);