CREATE TABLE public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  event_type text NOT NULL,
  action text,
  path text,
  ip text,
  city text, region text, country text,
  lat double precision, lng double precision, accuracy_m double precision,
  location_source text NOT NULL DEFAULT 'ip' CHECK (location_source IN ('gps','ip','none')),
  gps_declined boolean NOT NULL DEFAULT false,
  user_agent text,
  device_hash text,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own security events" ON public.security_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND event_type <> 'page_view');
CREATE POLICY "admins read security events" ON public.security_events FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));
CREATE INDEX security_events_user_idx ON public.security_events (user_id, created_at DESC);
CREATE INDEX security_events_created_idx ON public.security_events (created_at DESC);
CREATE INDEX security_events_ip_idx ON public.security_events (ip);

CREATE OR REPLACE FUNCTION public.block_security_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.security_retention', true) = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'security_events is append-only';
END $$;
CREATE TRIGGER security_events_append_only BEFORE UPDATE OR DELETE ON public.security_events
  FOR EACH ROW EXECUTE FUNCTION public.block_security_event_mutation();

CREATE OR REPLACE FUNCTION public.purge_security_events() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  PERFORM set_config('app.security_retention', 'on', true);
  DELETE FROM public.security_events
   WHERE (event_type = 'page_view' AND created_at < now() - interval '12 months')
      OR created_at < now() - interval '7 years';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.purge_security_events() FROM PUBLIC, anon, authenticated;

CREATE TABLE public.known_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_hash text NOT NULL,
  country text,
  user_agent text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  last_ip text, last_city text, last_region text,
  session_id text,
  revoked_at timestamptz,
  UNIQUE (user_id, device_hash)
);
GRANT SELECT ON public.known_devices TO authenticated;
GRANT ALL ON public.known_devices TO service_role;
ALTER TABLE public.known_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own devices" ON public.known_devices FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  salt text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mfa_recovery_codes TO service_role;
ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.mfa_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL,
  target_email text,
  reason text NOT NULL,
  identity_check text NOT NULL,
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mfa_reset_requests TO service_role;
ALTER TABLE public.mfa_reset_requests ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.guard_mfa_reset() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'mfa_reset_requests cannot be deleted'; END IF;
  IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'decided requests are immutable'; END IF;
  IF NEW.decided_by IS NOT NULL AND NEW.decided_by = OLD.requested_by THEN RAISE EXCEPTION 'requester cannot decide'; END IF;
  IF NEW.status = 'declined' AND coalesce(trim(NEW.decision_reason),'') = '' THEN RAISE EXCEPTION 'decline reason required'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER mfa_reset_guard BEFORE UPDATE OR DELETE ON public.mfa_reset_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_mfa_reset();

CREATE TABLE public.security_revoke_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.security_revoke_tokens TO service_role;
ALTER TABLE public.security_revoke_tokens ENABLE ROW LEVEL SECURITY;