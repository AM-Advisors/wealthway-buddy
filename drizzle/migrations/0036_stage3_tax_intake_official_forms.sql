ALTER TABLE public.investor_tax_forms
  ADD COLUMN IF NOT EXISTS document_path text,
  ADD COLUMN IF NOT EXISTS document_sha256 text,
  ADD COLUMN IF NOT EXISTS template_sha256 text,
  ADD COLUMN IF NOT EXISTS form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tax_facts_id uuid,
  ADD COLUMN IF NOT EXISTS tin_retained boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.protect_certified_tax_form()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Tax forms are permanent records'; END IF;
  IF NEW.form_type IS DISTINCT FROM OLD.form_type OR NEW.irs_revision IS DISTINCT FROM OLD.irs_revision
     OR NEW.classification IS DISTINCT FROM OLD.classification OR NEW.legal_name IS DISTINCT FROM OLD.legal_name
     OR NEW.tin_last4 IS DISTINCT FROM OLD.tin_last4 OR NEW.tin_fingerprint IS DISTINCT FROM OLD.tin_fingerprint
     OR NEW.certified_name IS DISTINCT FROM OLD.certified_name OR NEW.certified_at IS DISTINCT FROM OLD.certified_at
     OR NEW.certification_evidence IS DISTINCT FROM OLD.certification_evidence
     OR NEW.investment_profile_id IS DISTINCT FROM OLD.investment_profile_id
     OR NEW.document_path IS DISTINCT FROM OLD.document_path
     OR NEW.document_sha256 IS DISTINCT FROM OLD.document_sha256
     OR NEW.template_sha256 IS DISTINCT FROM OLD.template_sha256
     OR NEW.form_data IS DISTINCT FROM OLD.form_data
     OR NEW.tax_facts_id IS DISTINCT FROM OLD.tax_facts_id THEN
    RAISE EXCEPTION 'Certified tax forms cannot be rewritten; submit a new form';
  END IF;
  IF OLD.status = 'superseded' AND NEW.status <> 'superseded' THEN
    RAISE EXCEPTION 'Superseded tax forms stay superseded';
  END IF;
  RETURN NEW;
END $$;

CREATE TABLE public.investor_tax_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_profile_id uuid NOT NULL REFERENCES public.investment_profiles(id) ON DELETE RESTRICT,
  onboarding_id uuid REFERENCES public.investor_onboardings(id) ON DELETE SET NULL,
  investor_user_id uuid NOT NULL,
  answers jsonb NOT NULL,
  routing_status text NOT NULL CHECK (routing_status IN ('determined','needs_review')),
  form_type text,
  classification text,
  review_reason text,
  superseded_by uuid REFERENCES public.investor_tax_facts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.investor_tax_facts (investment_profile_id, created_at DESC);
GRANT SELECT ON public.investor_tax_facts TO authenticated;
GRANT ALL ON public.investor_tax_facts TO service_role;
ALTER TABLE public.investor_tax_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Investor reads own tax facts" ON public.investor_tax_facts FOR SELECT TO authenticated
  USING (investor_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.protect_tax_facts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Tax facts are permanent records'; END IF;
  IF NEW.answers IS DISTINCT FROM OLD.answers OR NEW.investment_profile_id IS DISTINCT FROM OLD.investment_profile_id
     OR NEW.routing_status IS DISTINCT FROM OLD.routing_status OR NEW.form_type IS DISTINCT FROM OLD.form_type
     OR NEW.classification IS DISTINCT FROM OLD.classification OR NEW.investor_user_id IS DISTINCT FROM OLD.investor_user_id THEN
    RAISE EXCEPTION 'Tax facts cannot be rewritten; submit new answers';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_tax_facts BEFORE UPDATE OR DELETE ON public.investor_tax_facts
  FOR EACH ROW EXECUTE FUNCTION public.protect_tax_facts();

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS private.tax_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_form_id uuid NOT NULL UNIQUE REFERENCES public.investor_tax_forms(id) ON DELETE RESTRICT,
  investment_profile_id uuid NOT NULL,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.tax_identifiers FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.store_tax_identifier(_form uuid, _profile uuid, _ciphertext text, _iv text, _key_version integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = private, public AS $$
  INSERT INTO private.tax_identifiers (tax_form_id, investment_profile_id, ciphertext, iv, key_version)
  VALUES (_form, _profile, _ciphertext, _iv, _key_version);
$$;
CREATE OR REPLACE FUNCTION public.read_tax_identifier(_form uuid)
RETURNS TABLE (ciphertext text, iv text, key_version integer) LANGUAGE sql SECURITY DEFINER STABLE SET search_path = private, public AS $$
  SELECT ciphertext, iv, key_version FROM private.tax_identifiers WHERE tax_form_id = _form;
$$;
REVOKE EXECUTE ON FUNCTION public.store_tax_identifier(uuid, uuid, text, text, integer) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_tax_identifier(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_tax_identifier(uuid, uuid, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_tax_identifier(uuid) TO service_role;

CREATE TABLE public.tax_evidence_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  tax_form_id uuid NOT NULL REFERENCES public.investor_tax_forms(id) ON DELETE RESTRICT,
  investment_profile_id uuid NOT NULL,
  access_kind text NOT NULL CHECK (access_kind IN ('document','tin')),
  purpose text NOT NULL,
  actor_role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tax_evidence_access_events TO authenticated;
GRANT ALL ON public.tax_evidence_access_events TO service_role;
ALTER TABLE public.tax_evidence_access_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read tax evidence access log" ON public.tax_evidence_access_events FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));
CREATE OR REPLACE FUNCTION public.protect_tax_evidence_access()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'The tax evidence access log is append-only'; END $$;
CREATE TRIGGER protect_tax_evidence_access BEFORE UPDATE OR DELETE ON public.tax_evidence_access_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_tax_evidence_access();