-- RBAC Stage 2: canonical access records. Server writes only (service_role);
-- no authenticated/anon grants, so the Data API cannot read or mutate them.

CREATE TABLE public.access_role_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  label text NOT NULL,
  category text NOT NULL CHECK (category IN ('harmonious','client','fund','company','custom')),
  permissions text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  cloned_from text,
  created_by uuid,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_key, version)
);
GRANT ALL ON public.access_role_definitions TO service_role;
ALTER TABLE public.access_role_definitions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.access_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role_key text NOT NULL,
  role_version integer,
  scope_type text NOT NULL CHECK (scope_type IN ('global','client','fund','company','investment_profile','investment')),
  scope_id uuid,
  effective_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  granted_by uuid NOT NULL,
  reason text NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope_type = 'global') = (scope_id IS NULL))
);
CREATE INDEX access_role_assignments_user_idx ON public.access_role_assignments(user_id);
GRANT ALL ON public.access_role_assignments TO service_role;
ALTER TABLE public.access_role_assignments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.access_permission_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission text NOT NULL,
  effect text NOT NULL CHECK (effect IN ('allow','deny')),
  scope_type text NOT NULL CHECK (scope_type IN ('global','client','fund','company','investment_profile','investment')),
  scope_id uuid,
  effective_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  granted_by uuid NOT NULL,
  reason text NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope_type = 'global') = (scope_id IS NULL))
);
CREATE INDEX access_permission_grants_user_idx ON public.access_permission_grants(user_id);
GRANT ALL ON public.access_permission_grants TO service_role;
ALTER TABLE public.access_permission_grants ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.access_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  actor_identity text,
  target_user_id uuid,
  action text NOT NULL,
  outcome text NOT NULL DEFAULT 'applied' CHECK (outcome IN ('applied','denied')),
  role_key text,
  permission text,
  scope_type text,
  scope_id uuid,
  previous_state jsonb,
  new_state jsonb,
  reason text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX access_audit_events_target_idx ON public.access_audit_events(target_user_id, created_at DESC);
GRANT SELECT, INSERT ON public.access_audit_events TO service_role;
ALTER TABLE public.access_audit_events ENABLE ROW LEVEL SECURITY;

-- Audit is append-only for everyone, including the service role.
CREATE OR REPLACE FUNCTION public.block_access_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'access audit events are immutable';
END $$;
CREATE TRIGGER access_audit_events_immutable BEFORE UPDATE OR DELETE ON public.access_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.block_access_audit_mutation();

-- Role definitions are versioned: a row never changes; edits insert a new version.
CREATE TRIGGER access_role_definitions_immutable BEFORE UPDATE OR DELETE ON public.access_role_definitions
  FOR EACH ROW EXECUTE FUNCTION public.block_access_audit_mutation();

-- Assignments and grants: only a one-time revocation may be recorded; nothing is deleted.
CREATE OR REPLACE FUNCTION public.protect_access_grant() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'access records cannot be deleted; revoke instead';
  END IF;
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'access record already revoked';
  END IF;
  IF NEW.revoked_at IS NULL OR NEW.revoked_by IS NULL OR coalesce(NEW.revoke_reason,'') = '' THEN
    RAISE EXCEPTION 'only revocation (with actor and reason) may be recorded';
  END IF;
  IF (to_jsonb(NEW) - 'revoked_at' - 'revoked_by' - 'revoke_reason') <> (to_jsonb(OLD) - 'revoked_at' - 'revoked_by' - 'revoke_reason') THEN
    RAISE EXCEPTION 'access records are immutable apart from revocation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER access_role_assignments_protect BEFORE UPDATE OR DELETE ON public.access_role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.protect_access_grant();
CREATE TRIGGER access_permission_grants_protect BEFORE UPDATE OR DELETE ON public.access_permission_grants
  FOR EACH ROW EXECUTE FUNCTION public.protect_access_grant();
