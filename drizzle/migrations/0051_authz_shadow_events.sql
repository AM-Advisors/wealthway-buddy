-- Stage 2.5 shadow authorization: non-enforcing legacy vs canonical comparison log.
-- Holds identifiers and outcome categories only — never request payloads.
CREATE TABLE public.authz_shadow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,
  actor_user_id uuid,
  permission text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  legacy_allowed boolean NOT NULL,
  canonical_allowed boolean NOT NULL,
  category text NOT NULL CHECK (category IN ('allow_allow','deny_deny','legacy_allow_rbac_deny','legacy_deny_rbac_allow')),
  canonical_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX authz_shadow_events_endpoint_idx ON public.authz_shadow_events(endpoint, created_at DESC);
GRANT SELECT, INSERT ON public.authz_shadow_events TO service_role;
ALTER TABLE public.authz_shadow_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER authz_shadow_events_immutable BEFORE UPDATE OR DELETE ON public.authz_shadow_events
  FOR EACH ROW EXECUTE FUNCTION public.block_access_audit_mutation();
