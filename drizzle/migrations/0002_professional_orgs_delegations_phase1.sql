-- Phase 1: Professional organizations, memberships, delegations, permissions, audit.
-- Additive only. Nothing here changes existing authorization behavior.

DO $$ BEGIN
  CREATE TYPE public.professional_org_type AS ENUM (
    'investment_adviser','broker_dealer','law_firm','accounting_firm','family_office',
    'wealth_manager','tax_advisor','trustee_fiduciary','custodian','consultant',
    'fund_manager_gp','administrator','placement_agent','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.professional_membership_status AS ENUM ('invited','active','suspended','removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.delegation_scope_type AS ENUM ('person','investment_profile','fund','investment','data_category');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.delegation_authority_level AS ENUM ('view','assist','limited_proxy','authorized_signatory','transaction_authority');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.delegation_status AS ENUM ('pending','active','suspended','revoked','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.delegation_capability AS ENUM (
    'view_profile','edit_profile_info','view_investments','prepare_investment','initiate_investment',
    'view_documents','upload_documents','view_tax_documents','view_financial_statements',
    'view_compliance_status','assist_kyc','assist_kyb','assist_accreditation',
    'view_capital_calls','view_distributions','view_banking_info','view_wire_instructions',
    'sign_specified_documents','approve_specified_actions'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. Organizations -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.professional_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  org_type public.professional_org_type NOT NULL DEFAULT 'other',
  website text,
  jurisdiction text,
  registration_number text,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.professional_organizations TO authenticated;
GRANT ALL ON public.professional_organizations TO service_role;
ALTER TABLE public.professional_organizations ENABLE ROW LEVEL SECURITY;

-- 2. Memberships ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.professional_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.professional_organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  email text,
  seat_role text NOT NULL DEFAULT 'member',
  status public.professional_membership_status NOT NULL DEFAULT 'invited',
  invited_by uuid,
  invited_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  suspended_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

GRANT SELECT ON public.professional_memberships TO authenticated;
GRANT ALL ON public.professional_memberships TO service_role;
ALTER TABLE public.professional_memberships ENABLE ROW LEVEL SECURITY;

-- 3. Delegations ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_user_id uuid NOT NULL,
  delegate_user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.professional_organizations(id) ON DELETE SET NULL,
  scope_type public.delegation_scope_type NOT NULL,
  scope_id uuid,
  data_category text,
  authority_level public.delegation_authority_level NOT NULL DEFAULT 'view',
  status public.delegation_status NOT NULL DEFAULT 'pending',
  effective_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  granted_by uuid NOT NULL,
  revoked_by uuid,
  revoked_at timestamptz,
  revoke_reason text,
  authority_document_path text,
  authority_document_name text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delegations_no_self CHECK (principal_user_id <> delegate_user_id)
);

CREATE INDEX IF NOT EXISTS delegations_delegate_idx ON public.delegations (delegate_user_id, status);
CREATE INDEX IF NOT EXISTS delegations_principal_idx ON public.delegations (principal_user_id, status);
CREATE INDEX IF NOT EXISTS delegations_scope_idx ON public.delegations (scope_type, scope_id);

GRANT SELECT ON public.delegations TO authenticated;
GRANT ALL ON public.delegations TO service_role;
ALTER TABLE public.delegations ENABLE ROW LEVEL SECURITY;

-- 4. Delegation permissions (deny by default: one row per granted capability)
CREATE TABLE IF NOT EXISTS public.delegation_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_id uuid NOT NULL REFERENCES public.delegations(id) ON DELETE CASCADE,
  capability public.delegation_capability NOT NULL,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delegation_id, capability)
);

GRANT SELECT ON public.delegation_permissions TO authenticated;
GRANT ALL ON public.delegation_permissions TO service_role;
ALTER TABLE public.delegation_permissions ENABLE ROW LEVEL SECURITY;

-- 5. Audit trail ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delegation_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  organization_id uuid,
  delegation_id uuid,
  membership_id uuid,
  principal_user_id uuid,
  delegate_user_id uuid,
  scope_type public.delegation_scope_type,
  scope_id uuid,
  authority_level public.delegation_authority_level,
  capabilities text[] NOT NULL DEFAULT '{}',
  action text NOT NULL,
  outcome text NOT NULL DEFAULT 'recorded',
  before_state jsonb,
  after_state jsonb,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delegation_audit_delegation_idx ON public.delegation_audit_events (delegation_id, created_at DESC);

GRANT SELECT ON public.delegation_audit_events TO authenticated;
GRANT ALL ON public.delegation_audit_events TO service_role;
ALTER TABLE public.delegation_audit_events ENABLE ROW LEVEL SECURITY;

-- 6. Read helpers --------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_org_member(_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.professional_memberships m
    WHERE m.organization_id = _organization_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION private.can_see_delegation(_delegation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.delegations d
    WHERE d.id = _delegation_id
      AND (d.principal_user_id = auth.uid() OR d.delegate_user_id = auth.uid())
  );
$$;

-- 7. Policies: read only for the people involved, plus staff.
--    Every mutation goes through a controlled server workflow (service role).
DROP POLICY IF EXISTS "staff read organizations" ON public.professional_organizations;
CREATE POLICY "staff read organizations" ON public.professional_organizations
  FOR SELECT TO authenticated USING (public.is_any_staff());

DROP POLICY IF EXISTS "members read their organization" ON public.professional_organizations;
CREATE POLICY "members read their organization" ON public.professional_organizations
  FOR SELECT TO authenticated USING (private.is_org_member(id));

DROP POLICY IF EXISTS "staff read memberships" ON public.professional_memberships;
CREATE POLICY "staff read memberships" ON public.professional_memberships
  FOR SELECT TO authenticated USING (public.is_any_staff());

DROP POLICY IF EXISTS "people read their own membership" ON public.professional_memberships;
CREATE POLICY "people read their own membership" ON public.professional_memberships
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "colleagues read active memberships" ON public.professional_memberships;
CREATE POLICY "colleagues read active memberships" ON public.professional_memberships
  FOR SELECT TO authenticated USING (private.is_org_member(organization_id));

DROP POLICY IF EXISTS "staff read delegations" ON public.delegations;
CREATE POLICY "staff read delegations" ON public.delegations
  FOR SELECT TO authenticated USING (public.is_any_staff());

DROP POLICY IF EXISTS "principal and delegate read delegations" ON public.delegations;
CREATE POLICY "principal and delegate read delegations" ON public.delegations
  FOR SELECT TO authenticated
  USING (principal_user_id = auth.uid() OR delegate_user_id = auth.uid());

DROP POLICY IF EXISTS "staff read delegation permissions" ON public.delegation_permissions;
CREATE POLICY "staff read delegation permissions" ON public.delegation_permissions
  FOR SELECT TO authenticated USING (public.is_any_staff());

DROP POLICY IF EXISTS "parties read delegation permissions" ON public.delegation_permissions;
CREATE POLICY "parties read delegation permissions" ON public.delegation_permissions
  FOR SELECT TO authenticated USING (private.can_see_delegation(delegation_id));

DROP POLICY IF EXISTS "staff read delegation audit" ON public.delegation_audit_events;
CREATE POLICY "staff read delegation audit" ON public.delegation_audit_events
  FOR SELECT TO authenticated USING (public.is_any_staff());

DROP POLICY IF EXISTS "principal reads their delegation audit" ON public.delegation_audit_events;
CREATE POLICY "principal reads their delegation audit" ON public.delegation_audit_events
  FOR SELECT TO authenticated USING (principal_user_id = auth.uid());

-- Keep updated_at fresh using the existing shared trigger function.
DROP TRIGGER IF EXISTS set_updated_at ON public.professional_organizations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.professional_organizations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.professional_memberships;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.professional_memberships
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.delegations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.delegations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
