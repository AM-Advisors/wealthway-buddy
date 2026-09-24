-- Multi-fund SOW coverage (junction; legacy client_sows.offering_id remains readable)
CREATE TABLE public.client_sow_funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sow_id uuid NOT NULL REFERENCES public.client_sows(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
  reason text,
  added_by uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_by uuid,
  removed_at timestamptz,
  removed_reason text
);
CREATE UNIQUE INDEX client_sow_funds_active_uq ON public.client_sow_funds (sow_id, offering_id) WHERE status = 'active';
CREATE INDEX client_sow_funds_offering_idx ON public.client_sow_funds (offering_id);
GRANT SELECT ON public.client_sow_funds TO authenticated;
GRANT ALL ON public.client_sow_funds TO service_role;
ALTER TABLE public.client_sow_funds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read SOW fund coverage" ON public.client_sow_funds FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE OR REPLACE FUNCTION public.protect_sow_fund_coverage() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'SOW Fund coverage is permanent; mark it removed instead.'; END IF;
  IF OLD.status = 'removed' THEN RAISE EXCEPTION 'Removed coverage cannot change.'; END IF;
  IF NEW.sow_id <> OLD.sow_id OR NEW.offering_id <> OLD.offering_id OR NEW.client_id <> OLD.client_id
     OR NEW.added_by <> OLD.added_by OR NEW.added_at <> OLD.added_at THEN
    RAISE EXCEPTION 'SOW Fund coverage is permanent; remove and add again.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_sow_funds_protect BEFORE UPDATE OR DELETE ON public.client_sow_funds FOR EACH ROW EXECUTE FUNCTION public.protect_sow_fund_coverage();

ALTER TABLE public.client_sows
  ADD COLUMN fund_scope text CHECK (fund_scope IS NULL OR fund_scope IN ('listed','client_wide')),
  ADD COLUMN governing_document_id uuid REFERENCES public.client_governing_documents(id);

-- Relationship types, provision scope and maker/checker approval
ALTER TABLE public.contract_document_relationships DROP CONSTRAINT IF EXISTS contract_document_relationships_relationship_type_check;
ALTER TABLE public.contract_document_relationships ADD CONSTRAINT contract_document_relationships_relationship_type_check
  CHECK (relationship_type IN ('supplements','amends','supersedes','controls_fund_scope','controls_service_scope','msa_controls_except_override','other',
    'msa_governs_sow','sow_governed_by_msa','amends_sow','sow_supersedes_sow','order_form_supplements_sow','fee_schedule_supplements','incorporates'));
ALTER TABLE public.contract_document_relationships DROP CONSTRAINT IF EXISTS contract_document_relationships_scope_check;
ALTER TABLE public.contract_document_relationships ADD CONSTRAINT contract_document_relationships_scope_check
  CHECK (scope IN ('client_wide','fund','service','provision'));
ALTER TABLE public.contract_document_relationships
  ADD COLUMN provision_reference text,
  ADD COLUMN approval_status text NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending_approval','approved','rejected')),
  ADD COLUMN approved_by uuid,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN approval_note text,
  ADD COLUMN proposed_from_contract boolean NOT NULL DEFAULT false;
ALTER TABLE public.contract_document_relationships ADD CONSTRAINT cdr_checker_differs CHECK (approved_by IS NULL OR approved_by <> recorded_by);

CREATE OR REPLACE FUNCTION public.protect_contract_relationships() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Contract relationships are permanent; retire instead.'; END IF;
  IF OLD.status = 'retired' THEN RAISE EXCEPTION 'A retired relationship cannot change.'; END IF;
  IF NEW.document_id <> OLD.document_id OR NEW.related_document_id IS DISTINCT FROM OLD.related_document_id
     OR NEW.relationship_type <> OLD.relationship_type OR NEW.scope <> OLD.scope
     OR NEW.offering_ids <> OLD.offering_ids OR NEW.service_keys <> OLD.service_keys
     OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
     OR NEW.provision_reference IS DISTINCT FROM OLD.provision_reference
     OR NEW.proposed_from_contract <> OLD.proposed_from_contract
     OR NEW.recorded_by <> OLD.recorded_by OR NEW.recorded_at <> OLD.recorded_at THEN
    RAISE EXCEPTION 'Contract relationships are permanent; retire and record a new one.';
  END IF;
  IF OLD.approval_status <> 'pending_approval' AND (NEW.approval_status <> OLD.approval_status
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at) THEN
    RAISE EXCEPTION 'A decided relationship approval cannot change.';
  END IF;
  RETURN NEW;
END; $$;

-- New contract capability for approving precedence determinations
ALTER TABLE public.contract_capability_grants DROP CONSTRAINT IF EXISTS contract_capability_grants_capability_check;
ALTER TABLE public.contract_capability_grants ADD CONSTRAINT contract_capability_grants_capability_check
  CHECK (capability IN ('view_contracts','upload_contracts','review_terms','correct_terms','confirm_execution','review_precedence','approve_terms','configure_pricing','view_pricing','generate_standard','approve_precedence'));

-- Structured pricing on contract terms and the pricing catalogue
ALTER TABLE public.contract_terms
  ADD COLUMN pricing_model text,
  ADD COLUMN rate_bps integer CHECK (rate_bps IS NULL OR (rate_bps >= 0 AND rate_bps <= 10000)),
  ADD COLUMN pricing_tiers jsonb;
ALTER TABLE public.pricing_items
  ADD COLUMN pricing_tiers jsonb,
  ADD COLUMN rate_bps integer CHECK (rate_bps IS NULL OR (rate_bps >= 0 AND rate_bps <= 10000));

-- Standard agreement package registry (components separately addressable)
CREATE TABLE public.standard_agreement_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_key text NOT NULL UNIQUE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','retired')),
  source_file_path text,
  source_sha256 text,
  prepared_by uuid NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  CHECK (approved_by IS NULL OR approved_by <> prepared_by)
);
CREATE TABLE public.standard_agreement_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.standard_agreement_packages(id) ON DELETE CASCADE,
  component_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('msa','sow','appendix','exhibit','fee_schedule')),
  title text NOT NULL,
  level text NOT NULL CHECK (level IN ('client','engagement')),
  part_of_key text,
  source_pages text,
  fee_structure jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, component_key)
);
GRANT SELECT ON public.standard_agreement_packages TO authenticated;
GRANT ALL ON public.standard_agreement_packages TO service_role;
GRANT SELECT ON public.standard_agreement_components TO authenticated;
GRANT ALL ON public.standard_agreement_components TO service_role;
ALTER TABLE public.standard_agreement_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_agreement_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read standard packages" ON public.standard_agreement_packages FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "Staff read standard components" ON public.standard_agreement_components FOR SELECT TO authenticated USING (public.is_any_staff());

-- Capability-based Harmonious staff RBAC
CREATE TABLE public.staff_custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text NOT NULL UNIQUE,
  label text NOT NULL,
  capabilities text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.staff_capability_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  capability text,
  role_key text,
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  revoked_by uuid,
  revoked_at timestamptz,
  CHECK ((capability IS NULL) <> (role_key IS NULL)),
  CHECK (granted_by <> user_id),
  CHECK (capability IS NULL OR capability NOT IN ('tax_full_tin','approve_compliance_exception','execute_money_movement'))
);
CREATE INDEX staff_capability_grants_user_idx ON public.staff_capability_grants (user_id) WHERE revoked_at IS NULL;
GRANT SELECT ON public.staff_custom_roles TO authenticated;
GRANT ALL ON public.staff_custom_roles TO service_role;
GRANT SELECT ON public.staff_capability_grants TO authenticated;
GRANT ALL ON public.staff_capability_grants TO service_role;
ALTER TABLE public.staff_custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_capability_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read custom roles" ON public.staff_custom_roles FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "Own or staff read capability grants" ON public.staff_capability_grants FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_any_staff());
