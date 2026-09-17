-- Phase 3C: professional firm verification, credentials, delegation acceptance,
-- authority documents, step-up authentication and delegated signatures.
-- Additive only. No transaction authority is enabled anywhere here.

-- 1. Organization verification ------------------------------------------
ALTER TABLE public.professional_organizations
  ADD COLUMN IF NOT EXISTS dba_name text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS business_identifier text,
  ADD COLUMN IF NOT EXISTS license_number text,
  ADD COLUMN IF NOT EXISTS regulatory_identifiers jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS primary_contact_name text,
  ADD COLUMN IF NOT EXISTS primary_contact_email text,
  ADD COLUMN IF NOT EXISTS primary_contact_phone text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS verification_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS reverification_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_note text;

DO $$ BEGIN
  ALTER TABLE public.professional_organizations
    ADD CONSTRAINT professional_organizations_verification_status_check
    CHECK (verification_status IN ('draft','submitted','pending_verification','verified','review_required','rejected','reverification_required'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.professional_organization_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.professional_organizations(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  document_hash text,
  uploaded_by uuid NOT NULL,
  review_status text NOT NULL DEFAULT 'uploaded',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.professional_organization_documents TO authenticated;
GRANT ALL ON public.professional_organization_documents TO service_role;
ALTER TABLE public.professional_organization_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read org documents" ON public.professional_organization_documents;
CREATE POLICY "staff read org documents" ON public.professional_organization_documents
  FOR SELECT TO authenticated USING (public.is_any_staff());
DROP POLICY IF EXISTS "members read org documents" ON public.professional_organization_documents;
CREATE POLICY "members read org documents" ON public.professional_organization_documents
  FOR SELECT TO authenticated USING (private.is_org_member(organization_id));

-- 2. Individual professional credentials ---------------------------------
CREATE TABLE IF NOT EXISTS public.professional_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.professional_organizations(id) ON DELETE SET NULL,
  credential_type text NOT NULL,
  jurisdiction text,
  credential_number text,
  firm_identifier text,
  fiduciary_capacity text,
  issued_at date,
  expires_at date,
  status text NOT NULL DEFAULT 'unverified',
  verified_at timestamptz,
  verified_by uuid,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS professional_credentials_user_idx ON public.professional_credentials (user_id, status);
GRANT SELECT ON public.professional_credentials TO authenticated;
GRANT ALL ON public.professional_credentials TO service_role;
ALTER TABLE public.professional_credentials ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  ALTER TABLE public.professional_credentials
    ADD CONSTRAINT professional_credentials_status_check
    CHECK (status IN ('unverified','submitted','verified','expired','revoked','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "staff read credentials" ON public.professional_credentials;
CREATE POLICY "staff read credentials" ON public.professional_credentials
  FOR SELECT TO authenticated USING (public.is_any_staff());
DROP POLICY IF EXISTS "own credentials" ON public.professional_credentials;
CREATE POLICY "own credentials" ON public.professional_credentials
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 3. Delegation acceptance ------------------------------------------------
ALTER TABLE public.delegations
  ADD COLUMN IF NOT EXISTS acceptance_state text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid,
  ADD COLUMN IF NOT EXISTS accepted_terms_version text,
  ADD COLUMN IF NOT EXISTS grant_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS covered_document_types text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS material_change_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.delegations
    ADD CONSTRAINT delegations_acceptance_state_check
    CHECK (acceptance_state IN ('not_required','awaiting_acceptance','accepted','renewal_required','declined'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.delegation_acceptance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_id uuid NOT NULL REFERENCES public.delegations(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  actor_kind text NOT NULL,
  action text NOT NULL,
  grant_version integer NOT NULL DEFAULT 1,
  principal_user_id uuid NOT NULL,
  delegate_user_id uuid NOT NULL,
  organization_id uuid,
  scope_type public.delegation_scope_type,
  scope_id uuid,
  authority_level public.delegation_authority_level,
  capabilities text[] NOT NULL DEFAULT '{}',
  effective_at timestamptz,
  expires_at timestamptz,
  terms_version text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delegation_acceptance_delegation_idx
  ON public.delegation_acceptance_events (delegation_id, created_at DESC);
GRANT SELECT ON public.delegation_acceptance_events TO authenticated;
GRANT ALL ON public.delegation_acceptance_events TO service_role;
ALTER TABLE public.delegation_acceptance_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parties read acceptance events" ON public.delegation_acceptance_events;
CREATE POLICY "parties read acceptance events" ON public.delegation_acceptance_events
  FOR SELECT TO authenticated
  USING (principal_user_id = auth.uid() OR delegate_user_id = auth.uid() OR public.is_any_staff());

-- 4. Authority documents ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.authority_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_id uuid REFERENCES public.delegations(id) ON DELETE CASCADE,
  principal_user_id uuid NOT NULL,
  delegate_user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.professional_organizations(id) ON DELETE SET NULL,
  document_type text NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  document_hash text,
  version integer NOT NULL DEFAULT 1,
  scope_type public.delegation_scope_type NOT NULL,
  scope_id uuid,
  covered_actions text[] NOT NULL DEFAULT '{}',
  covered_document_types text[] NOT NULL DEFAULT '{}',
  effective_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  review_status text NOT NULL DEFAULT 'uploaded',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  revoked_at timestamptz,
  revoked_by uuid,
  superseded_by uuid,
  submitted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS authority_documents_delegation_idx
  ON public.authority_documents (delegation_id, review_status);
GRANT SELECT ON public.authority_documents TO authenticated;
GRANT ALL ON public.authority_documents TO service_role;
ALTER TABLE public.authority_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  ALTER TABLE public.authority_documents
    ADD CONSTRAINT authority_documents_review_status_check
    CHECK (review_status IN ('uploaded','in_review','accepted','rejected','revoked','expired','superseded'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "parties read authority documents" ON public.authority_documents;
CREATE POLICY "parties read authority documents" ON public.authority_documents
  FOR SELECT TO authenticated
  USING (principal_user_id = auth.uid() OR delegate_user_id = auth.uid() OR public.is_any_staff());

-- 5. Step-up authentication events ----------------------------------------
CREATE TABLE IF NOT EXISTS public.stepup_authentications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  method text NOT NULL,
  challenge_reference text,
  session_reference text,
  action text NOT NULL,
  resource_type text,
  resource_id uuid,
  delegation_id uuid,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  verified_at timestamptz,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stepup_user_idx ON public.stepup_authentications (user_id, status, expires_at DESC);
GRANT SELECT ON public.stepup_authentications TO authenticated;
GRANT ALL ON public.stepup_authentications TO service_role;
ALTER TABLE public.stepup_authentications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own step up events" ON public.stepup_authentications;
CREATE POLICY "own step up events" ON public.stepup_authentications
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_any_staff());

-- 6. Delegated signatures (append-only record of the agency chain) --------
CREATE TABLE IF NOT EXISTS public.delegated_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signer_user_id uuid NOT NULL,
  signer_name text NOT NULL,
  signer_title text,
  principal_user_id uuid NOT NULL,
  principal_name text,
  profile_id uuid,
  profile_label text,
  organization_id uuid,
  organization_name text,
  delegation_id uuid NOT NULL,
  authority_document_id uuid NOT NULL,
  authority_level public.delegation_authority_level NOT NULL,
  fund_id uuid,
  investment_id uuid,
  document_type text NOT NULL,
  document_reference text,
  document_name text,
  document_hash text NOT NULL,
  signature_statement text NOT NULL,
  stepup_id uuid NOT NULL,
  stepup_method text NOT NULL,
  ip_address text,
  user_agent text,
  signed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delegated_signatures_principal_idx
  ON public.delegated_signatures (principal_user_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS delegated_signatures_signer_idx
  ON public.delegated_signatures (signer_user_id, signed_at DESC);
GRANT SELECT ON public.delegated_signatures TO authenticated;
GRANT ALL ON public.delegated_signatures TO service_role;
ALTER TABLE public.delegated_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parties read delegated signatures" ON public.delegated_signatures;
CREATE POLICY "parties read delegated signatures" ON public.delegated_signatures
  FOR SELECT TO authenticated
  USING (principal_user_id = auth.uid() OR signer_user_id = auth.uid() OR public.is_any_staff());

-- 7. Authority notifications ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.authority_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL,
  recipient_kind text NOT NULL DEFAULT 'principal',
  kind text NOT NULL,
  message text NOT NULL,
  delegation_id uuid,
  authority_document_id uuid,
  organization_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS authority_notifications_recipient_idx
  ON public.authority_notifications (recipient_user_id, created_at DESC);
GRANT SELECT ON public.authority_notifications TO authenticated;
GRANT ALL ON public.authority_notifications TO service_role;
ALTER TABLE public.authority_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own authority notifications" ON public.authority_notifications;
CREATE POLICY "own authority notifications" ON public.authority_notifications
  FOR SELECT TO authenticated USING (recipient_user_id = auth.uid() OR public.is_any_staff());
