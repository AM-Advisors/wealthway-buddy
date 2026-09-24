ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS dba_name text,
  ADD COLUMN IF NOT EXISTS client_type text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS jurisdiction text,
  ADD COLUMN IF NOT EXISTS address jsonb,
  ADD COLUMN IF NOT EXISTS ein_last4 text,
  ADD COLUMN IF NOT EXISTS relationship_owner_id uuid,
  ADD COLUMN IF NOT EXISTS referral_source text,
  ADD COLUMN IF NOT EXISTS intake_status text NOT NULL DEFAULT 'complete',
  ADD COLUMN IF NOT EXISTS intake_step integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS expected_services text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contract_choice text;
ALTER TABLE public.clients ADD CONSTRAINT clients_intake_status_chk CHECK (intake_status IN ('draft','complete'));
ALTER TABLE public.clients ADD CONSTRAINT clients_ein_last4_chk CHECK (ein_last4 IS NULL OR ein_last4 ~ '^[0-9]{4}$');
ALTER TABLE public.clients ADD CONSTRAINT clients_contract_choice_chk CHECK (contract_choice IS NULL OR contract_choice IN ('upload','standard','later'));

CREATE TABLE public.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  phone text,
  title text,
  designations text[] NOT NULL DEFAULT '{}',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_contacts_client_idx ON public.client_contacts (client_id);
GRANT SELECT ON public.client_contacts TO authenticated;
GRANT ALL ON public.client_contacts TO service_role;
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read client contacts" ON public.client_contacts FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE TABLE public.client_governing_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('msa','sow','engagement','amendment','addendum','pricing_schedule','other')),
  title text NOT NULL,
  parent_document_id uuid REFERENCES public.client_governing_documents(id),
  supersedes_id uuid REFERENCES public.client_governing_documents(id),
  version integer NOT NULL DEFAULT 1,
  file_path text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  execution_status text NOT NULL DEFAULT 'needs_review' CHECK (execution_status IN ('needs_review','executed_confirmed','not_executed')),
  effective_date date,
  expiration_date date,
  notice_days integer,
  applies_to_offering_ids uuid[] NOT NULL DEFAULT '{}',
  review_status text NOT NULL DEFAULT 'uploaded' CHECK (review_status IN ('uploaded','awaiting_review','manual_review_required','extraction_failed','approved','superseded')),
  precedence_status text NOT NULL DEFAULT 'requires_review' CHECK (precedence_status IN ('requires_review','confirmed','not_applicable')),
  precedence_note text,
  approved_by uuid,
  approved_at timestamptz,
  applied_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, sha256)
);
CREATE INDEX client_governing_documents_client_idx ON public.client_governing_documents (client_id);
GRANT SELECT ON public.client_governing_documents TO authenticated;
GRANT ALL ON public.client_governing_documents TO service_role;
ALTER TABLE public.client_governing_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read governing documents" ON public.client_governing_documents FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE TABLE public.contract_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.client_governing_documents(id) ON DELETE CASCADE,
  model text NOT NULL,
  prompt_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('completed','failed','poor_quality')),
  text_chars integer NOT NULL DEFAULT 0,
  page_count integer,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.contract_extractions TO authenticated;
GRANT ALL ON public.contract_extractions TO service_role;
ALTER TABLE public.contract_extractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read extractions" ON public.contract_extractions FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE TABLE public.contract_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.client_governing_documents(id) ON DELETE CASCADE,
  extraction_id uuid REFERENCES public.contract_extractions(id) ON DELETE SET NULL,
  category text NOT NULL,
  term_key text NOT NULL,
  label text NOT NULL,
  material boolean NOT NULL DEFAULT true,
  extracted_value text,
  current_value text,
  amount_cents bigint,
  service_key text,
  basis text NOT NULL DEFAULT 'not_found' CHECK (basis IN ('explicit','inferred','not_found')),
  confidence numeric,
  source_page text,
  source_section text,
  source_quote text,
  status text NOT NULL DEFAULT 'needs_review' CHECK (status IN ('needs_review','confirmed','corrected','not_applicable')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contract_terms_document_idx ON public.contract_terms (document_id);
GRANT SELECT ON public.contract_terms TO authenticated;
GRANT ALL ON public.contract_terms TO service_role;
ALTER TABLE public.contract_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read contract terms" ON public.contract_terms FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE TABLE public.contract_term_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id uuid NOT NULL REFERENCES public.contract_terms(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.client_governing_documents(id) ON DELETE CASCADE,
  previous_value text,
  new_value text,
  previous_status text,
  new_status text,
  reason text,
  source_reference text,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.contract_term_changes TO authenticated;
GRANT ALL ON public.contract_term_changes TO service_role;
ALTER TABLE public.contract_term_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read term changes" ON public.contract_term_changes FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE OR REPLACE FUNCTION public.block_term_change_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Contract term history is immutable.'; END; $$;
CREATE TRIGGER contract_term_changes_immutable BEFORE UPDATE OR DELETE ON public.contract_term_changes FOR EACH ROW EXECUTE FUNCTION public.block_term_change_mutation();

-- Approved terms never change silently.
CREATE OR REPLACE FUNCTION public.protect_approved_contract_terms() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.client_governing_documents d WHERE d.id = OLD.document_id AND d.review_status IN ('approved','superseded')) THEN
    RAISE EXCEPTION 'Terms of an approved contract cannot change; upload an amendment.';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END; $$;
CREATE TRIGGER contract_terms_protect BEFORE UPDATE OR DELETE ON public.contract_terms FOR EACH ROW EXECUTE FUNCTION public.protect_approved_contract_terms();

ALTER TABLE public.client_pricing
  ADD COLUMN IF NOT EXISTS pricing_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES public.client_governing_documents(id),
  ADD COLUMN IF NOT EXISTS source_term_id uuid REFERENCES public.contract_terms(id),
  ADD COLUMN IF NOT EXISTS offering_id uuid REFERENCES public.offerings(id),
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;
ALTER TABLE public.client_pricing ADD CONSTRAINT client_pricing_source_chk CHECK (pricing_source IN ('manual','standard','contract'));
CREATE UNIQUE INDEX IF NOT EXISTS client_pricing_source_term_uq ON public.client_pricing (source_term_id) WHERE source_term_id IS NOT NULL;