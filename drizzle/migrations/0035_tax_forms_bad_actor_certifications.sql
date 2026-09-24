CREATE OR REPLACE FUNCTION public.is_platform_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'admin')
$$;

CREATE TABLE public.investor_tax_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_profile_id uuid NOT NULL REFERENCES public.investment_profiles(id) ON DELETE RESTRICT,
  investor_user_id uuid NOT NULL,
  onboarding_id uuid REFERENCES public.investor_onboardings(id) ON DELETE SET NULL,
  form_type public.tax_documentation_form NOT NULL,
  irs_revision text NOT NULL,
  irs_source_url text NOT NULL,
  classification text NOT NULL,
  legal_name text NOT NULL,
  tin_last4 text,
  tin_fingerprint text,
  country text,
  status text NOT NULL DEFAULT 'certified' CHECK (status IN ('certified','needs_review','superseded','invalid')),
  certified_name text NOT NULL,
  certified_at timestamptz NOT NULL DEFAULT now(),
  certification_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_on date,
  superseded_by uuid REFERENCES public.investor_tax_forms(id),
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.investor_tax_forms (investment_profile_id, status);
GRANT SELECT ON public.investor_tax_forms TO authenticated;
GRANT ALL ON public.investor_tax_forms TO service_role;
ALTER TABLE public.investor_tax_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Investor reads own tax forms" ON public.investor_tax_forms FOR SELECT TO authenticated
  USING (investor_user_id = auth.uid());
CREATE POLICY "Admins read tax forms" ON public.investor_tax_forms FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.protect_certified_tax_form()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Tax forms are permanent records'; END IF;
  IF NEW.form_type IS DISTINCT FROM OLD.form_type OR NEW.irs_revision IS DISTINCT FROM OLD.irs_revision
     OR NEW.classification IS DISTINCT FROM OLD.classification OR NEW.legal_name IS DISTINCT FROM OLD.legal_name
     OR NEW.tin_last4 IS DISTINCT FROM OLD.tin_last4 OR NEW.tin_fingerprint IS DISTINCT FROM OLD.tin_fingerprint
     OR NEW.certified_name IS DISTINCT FROM OLD.certified_name OR NEW.certified_at IS DISTINCT FROM OLD.certified_at
     OR NEW.certification_evidence IS DISTINCT FROM OLD.certification_evidence
     OR NEW.investment_profile_id IS DISTINCT FROM OLD.investment_profile_id THEN
    RAISE EXCEPTION 'Certified tax forms cannot be rewritten; submit a new form';
  END IF;
  IF OLD.status = 'superseded' AND NEW.status <> 'superseded' THEN
    RAISE EXCEPTION 'Superseded tax forms stay superseded';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_certified_tax_form BEFORE UPDATE OR DELETE ON public.investor_tax_forms
  FOR EACH ROW EXECUTE FUNCTION public.protect_certified_tax_form();

CREATE TABLE public.compliance_questionnaire_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('bad_actor')),
  version integer NOT NULL,
  questions jsonb NOT NULL,
  wording_status text NOT NULL DEFAULT 'approval_required' CHECK (wording_status IN ('approval_required','approved')),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, version)
);
GRANT SELECT ON public.compliance_questionnaire_versions TO authenticated;
GRANT ALL ON public.compliance_questionnaire_versions TO service_role;
ALTER TABLE public.compliance_questionnaire_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read questionnaire versions" ON public.compliance_questionnaire_versions
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.compliance_questionnaire_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid REFERENCES public.compliance_questionnaire_versions(id),
  kind text NOT NULL,
  questionnaire_version integer NOT NULL,
  onboarding_id uuid REFERENCES public.investor_onboardings(id) ON DELETE SET NULL,
  offering_id uuid NOT NULL,
  investment_profile_id uuid NOT NULL REFERENCES public.investment_profiles(id) ON DELETE RESTRICT,
  responder_user_id uuid NOT NULL,
  relationship_roles text[] NOT NULL DEFAULT '{}',
  answers jsonb NOT NULL,
  certified_name text NOT NULL,
  certified_at timestamptz NOT NULL DEFAULT now(),
  review_status text NOT NULL CHECK (review_status IN ('submitted','review_required','cleared','escalated')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  superseded_by uuid REFERENCES public.compliance_questionnaire_responses(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.compliance_questionnaire_responses (onboarding_id, kind);
GRANT SELECT ON public.compliance_questionnaire_responses TO authenticated;
GRANT ALL ON public.compliance_questionnaire_responses TO service_role;
ALTER TABLE public.compliance_questionnaire_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Responder reads own questionnaire" ON public.compliance_questionnaire_responses FOR SELECT TO authenticated
  USING (responder_user_id = auth.uid());
CREATE POLICY "Admins read questionnaires" ON public.compliance_questionnaire_responses FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.protect_certified_questionnaire()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Certified questionnaires are permanent records'; END IF;
  IF NEW.answers IS DISTINCT FROM OLD.answers OR NEW.version_id IS DISTINCT FROM OLD.version_id
     OR NEW.questionnaire_version IS DISTINCT FROM OLD.questionnaire_version
     OR NEW.certified_name IS DISTINCT FROM OLD.certified_name OR NEW.certified_at IS DISTINCT FROM OLD.certified_at
     OR NEW.responder_user_id IS DISTINCT FROM OLD.responder_user_id
     OR NEW.investment_profile_id IS DISTINCT FROM OLD.investment_profile_id
     OR NEW.relationship_roles IS DISTINCT FROM OLD.relationship_roles THEN
    RAISE EXCEPTION 'Certified questionnaire answers cannot be rewritten; submit a new response';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_certified_questionnaire BEFORE UPDATE OR DELETE ON public.compliance_questionnaire_responses
  FOR EACH ROW EXECUTE FUNCTION public.protect_certified_questionnaire();

CREATE TABLE public.investor_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL REFERENCES public.investor_onboardings(id) ON DELETE RESTRICT,
  investment_profile_id uuid NOT NULL REFERENCES public.investment_profiles(id) ON DELETE RESTRICT,
  investor_user_id uuid NOT NULL,
  certification_key text NOT NULL,
  certification_version integer NOT NULL,
  wording_status text NOT NULL,
  certified_name text NOT NULL,
  certified_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.investor_certifications (onboarding_id);
GRANT SELECT ON public.investor_certifications TO authenticated;
GRANT ALL ON public.investor_certifications TO service_role;
ALTER TABLE public.investor_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Investor reads own certifications" ON public.investor_certifications FOR SELECT TO authenticated
  USING (investor_user_id = auth.uid());
CREATE POLICY "Admins read certifications" ON public.investor_certifications FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));
CREATE OR REPLACE FUNCTION public.protect_investor_certification()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Certifications are permanent records'; END $$;
CREATE TRIGGER protect_investor_certification BEFORE UPDATE OR DELETE ON public.investor_certifications
  FOR EACH ROW EXECUTE FUNCTION public.protect_investor_certification();