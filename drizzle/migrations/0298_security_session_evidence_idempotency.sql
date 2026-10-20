ALTER TABLE public.security_events ADD COLUMN IF NOT EXISTS event_key text;
CREATE UNIQUE INDEX IF NOT EXISTS security_events_event_key_idx ON public.security_events(event_key) WHERE event_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS security_events_session_created_idx ON public.security_events(session_id, created_at DESC);
COMMENT ON COLUMN public.security_events.event_key IS 'Server-derived idempotency key for new authenticated session observations; historical rows remain unchanged.';