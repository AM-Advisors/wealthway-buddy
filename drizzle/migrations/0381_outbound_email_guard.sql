CREATE TABLE public.outbound_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  action text NOT NULL,
  scope_key text NOT NULL,
  recipient_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.outbound_email_events TO service_role;

ALTER TABLE public.outbound_email_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX outbound_email_events_scope_idx
  ON public.outbound_email_events (action, scope_key, created_at DESC);
CREATE INDEX outbound_email_events_actor_idx
  ON public.outbound_email_events (actor_id, created_at DESC);
CREATE INDEX outbound_email_events_recipient_idx
  ON public.outbound_email_events (recipient_hash, created_at DESC);

COMMENT ON TABLE public.outbound_email_events IS
  'Server-only record of staff/manager-triggered outbound emails, used to cap sending volume. No client access.';