ALTER TABLE public.client_governing_documents
  ADD COLUMN IF NOT EXISTS applies_to_service_keys text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'upload',
  ADD COLUMN IF NOT EXISTS msa_version_id uuid REFERENCES public.msa_versions(id),
  ADD COLUMN IF NOT EXISTS standard_fields jsonb,
  ADD COLUMN IF NOT EXISTS standard_status text,
  ADD COLUMN IF NOT EXISTS standard_prepared_by uuid,
  ADD COLUMN IF NOT EXISTS standard_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS standard_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS standard_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_msa_agreement_id uuid REFERENCES public.client_msa_agreements(id),
  ADD COLUMN IF NOT EXISTS terminated_on date,
  ADD COLUMN IF NOT EXISTS terminated_note text;
ALTER TABLE public.client_governing_documents ADD CONSTRAINT cgd_source_chk CHECK (source IN ('upload','standard_template'));
ALTER TABLE public.client_governing_documents ADD CONSTRAINT cgd_standard_status_chk CHECK (standard_status IS NULL OR standard_status IN ('draft','approved_to_send','sent','executed','cancelled'));
ALTER TABLE public.client_governing_documents DROP CONSTRAINT IF EXISTS client_governing_documents_review_status_check;
ALTER TABLE public.client_governing_documents ADD CONSTRAINT client_governing_documents_review_status_check
  CHECK (review_status IN ('draft','uploaded','awaiting_review','manual_review_required','extraction_failed','approved','superseded'));

CREATE TABLE public.contract_document_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.client_governing_documents(id) ON DELETE CASCADE,
  related_document_id uuid REFERENCES public.client_governing_documents(id) ON DELETE CASCADE,
  relationship_type text NOT NULL CHECK (relationship_type IN ('supplements','amends','supersedes','controls_fund_scope','controls_service_scope','msa_controls_except_override','other')),
  scope text NOT NULL DEFAULT 'client_wide' CHECK (scope IN ('client_wide','fund','service')),
  offering_ids uuid[] NOT NULL DEFAULT '{}',
  service_keys text[] NOT NULL DEFAULT '{}',
  reason text,
  source_reference text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  retired_by uuid,
  retired_at timestamptz,
  retired_reason text
);
CREATE INDEX cdr_client_idx ON public.contract_document_relationships (client_id);
GRANT SELECT ON public.contract_document_relationships TO authenticated;
GRANT ALL ON public.contract_document_relationships TO service_role;
ALTER TABLE public.contract_document_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read contract relationships" ON public.contract_document_relationships FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE OR REPLACE FUNCTION public.protect_contract_relationships() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Contract relationships are permanent; retire instead.'; END IF;
  IF OLD.status = 'retired' THEN RAISE EXCEPTION 'A retired relationship cannot change.'; END IF;
  IF NEW.document_id <> OLD.document_id OR NEW.related_document_id IS DISTINCT FROM OLD.related_document_id
     OR NEW.relationship_type <> OLD.relationship_type OR NEW.scope <> OLD.scope
     OR NEW.offering_ids <> OLD.offering_ids OR NEW.service_keys <> OLD.service_keys
     OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
     OR NEW.recorded_by <> OLD.recorded_by OR NEW.recorded_at <> OLD.recorded_at THEN
    RAISE EXCEPTION 'Contract relationships are permanent; retire and record a new one.';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER contract_relationships_protect BEFORE UPDATE OR DELETE ON public.contract_document_relationships FOR EACH ROW EXECUTE FUNCTION public.protect_contract_relationships();

CREATE TABLE public.contract_precedence_determinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.client_governing_documents(id) ON DELETE CASCADE,
  previous_status text,
  new_status text NOT NULL,
  relationship_id uuid REFERENCES public.contract_document_relationships(id),
  note text,
  source_reference text,
  decided_by uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.contract_precedence_determinations TO authenticated;
GRANT ALL ON public.contract_precedence_determinations TO service_role;
ALTER TABLE public.contract_precedence_determinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read precedence history" ON public.contract_precedence_determinations FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE TRIGGER contract_precedence_immutable BEFORE UPDATE OR DELETE ON public.contract_precedence_determinations FOR EACH ROW EXECUTE FUNCTION public.block_term_change_mutation();

CREATE TABLE public.contract_capability_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  capability text NOT NULL CHECK (capability IN ('view_contracts','upload_contracts','review_terms','correct_terms','confirm_execution','review_precedence','approve_terms','configure_pricing','view_pricing','generate_standard')),
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid,
  revoked_at timestamptz,
  reason text
);
CREATE UNIQUE INDEX contract_capability_grants_active_uq ON public.contract_capability_grants (user_id, capability) WHERE revoked_at IS NULL;
GRANT SELECT ON public.contract_capability_grants TO authenticated;
GRANT ALL ON public.contract_capability_grants TO service_role;
ALTER TABLE public.contract_capability_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own or staff read contract grants" ON public.contract_capability_grants FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_any_staff());