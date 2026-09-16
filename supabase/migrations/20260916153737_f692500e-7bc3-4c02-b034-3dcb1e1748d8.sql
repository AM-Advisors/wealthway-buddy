
CREATE TABLE public.ct_issuers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  issuer_type text NOT NULL DEFAULT 'fund',
  contact_email text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ct_issuers_company_idx ON public.ct_issuers(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_issuers TO authenticated;
GRANT ALL ON public.ct_issuers TO service_role;
ALTER TABLE public.ct_issuers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ct_issuers_view" ON public.ct_issuers FOR SELECT TO authenticated USING (public.ct_can_view(company_id));
CREATE POLICY "ct_issuers_manage" ON public.ct_issuers FOR ALL TO authenticated USING (public.ct_can_manage(company_id)) WITH CHECK (public.ct_can_manage(company_id));

CREATE TABLE public.ct_claim_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  issuer_id uuid REFERENCES public.ct_issuers(id) ON DELETE SET NULL,
  claimant_name text NOT NULL,
  claimant_email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ct_claim_invites_company_idx ON public.ct_claim_invites(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_claim_invites TO authenticated;
GRANT ALL ON public.ct_claim_invites TO service_role;
ALTER TABLE public.ct_claim_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ct_claim_invites_view" ON public.ct_claim_invites FOR SELECT TO authenticated USING (public.ct_can_view(company_id));
CREATE POLICY "ct_claim_invites_manage" ON public.ct_claim_invites FOR ALL TO authenticated USING (public.ct_can_manage(company_id)) WITH CHECK (public.ct_can_manage(company_id));

CREATE TABLE public.ct_exposure_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  issuer_id uuid REFERENCES public.ct_issuers(id) ON DELETE SET NULL,
  invite_id uuid REFERENCES public.ct_claim_invites(id) ON DELETE SET NULL,
  claimant_user_id uuid,
  claimant_stakeholder_id uuid REFERENCES public.ct_stakeholders(id) ON DELETE SET NULL,
  claimant_name text NOT NULL,
  claimant_email text,
  claimant_type text NOT NULL DEFAULT 'fund',
  security_type text NOT NULL DEFAULT 'common',
  security_label text,
  claimed_quantity numeric NOT NULL DEFAULT 0,
  verified_quantity numeric,
  holding_route text NOT NULL DEFAULT 'direct',
  through_entity text,
  as_of_date date,
  status text NOT NULL DEFAULT 'submitted',
  claimant_note text,
  reviewer_note text,
  info_request text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ct_exposure_claims_company_idx ON public.ct_exposure_claims(company_id);
CREATE INDEX ct_exposure_claims_claimant_idx ON public.ct_exposure_claims(claimant_user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_exposure_claims TO authenticated;
GRANT ALL ON public.ct_exposure_claims TO service_role;
ALTER TABLE public.ct_exposure_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ct_claims_company_view" ON public.ct_exposure_claims FOR SELECT TO authenticated USING (public.ct_can_view(company_id));
CREATE POLICY "ct_claims_company_manage" ON public.ct_exposure_claims FOR ALL TO authenticated USING (public.ct_can_manage(company_id)) WITH CHECK (public.ct_can_manage(company_id));
CREATE POLICY "ct_claims_self_view" ON public.ct_exposure_claims FOR SELECT TO authenticated USING (claimant_user_id = auth.uid());
CREATE POLICY "ct_claims_self_insert" ON public.ct_exposure_claims FOR INSERT TO authenticated WITH CHECK (claimant_user_id = auth.uid());
CREATE POLICY "ct_claims_self_update" ON public.ct_exposure_claims FOR UPDATE TO authenticated USING (claimant_user_id = auth.uid() AND status IN ('submitted','info_requested')) WITH CHECK (claimant_user_id = auth.uid());

CREATE TABLE public.ct_claim_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.ct_exposure_claims(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  storage_path text NOT NULL,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ct_claim_documents_claim_idx ON public.ct_claim_documents(claim_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_claim_documents TO authenticated;
GRANT ALL ON public.ct_claim_documents TO service_role;
ALTER TABLE public.ct_claim_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ct_claim_docs_company_view" ON public.ct_claim_documents FOR SELECT TO authenticated USING (public.ct_can_view(company_id));
CREATE POLICY "ct_claim_docs_company_manage" ON public.ct_claim_documents FOR ALL TO authenticated USING (public.ct_can_manage(company_id)) WITH CHECK (public.ct_can_manage(company_id));
CREATE POLICY "ct_claim_docs_self" ON public.ct_claim_documents FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ct_exposure_claims c WHERE c.id = claim_id AND c.claimant_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ct_exposure_claims c WHERE c.id = claim_id AND c.claimant_user_id = auth.uid()));

CREATE TABLE public.ct_activity_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  claim_id uuid REFERENCES public.ct_exposure_claims(id) ON DELETE SET NULL,
  title text NOT NULL,
  case_type text NOT NULL DEFAULT 'unverified_claim',
  status text NOT NULL DEFAULT 'open',
  severity text NOT NULL DEFAULT 'medium',
  claimed_quantity numeric,
  record_quantity numeric,
  summary text,
  resolution text,
  opened_by uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ct_activity_cases_company_idx ON public.ct_activity_cases(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_activity_cases TO authenticated;
GRANT ALL ON public.ct_activity_cases TO service_role;
ALTER TABLE public.ct_activity_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ct_cases_view" ON public.ct_activity_cases FOR SELECT TO authenticated USING (public.ct_can_view(company_id));
CREATE POLICY "ct_cases_manage" ON public.ct_activity_cases FOR ALL TO authenticated USING (public.ct_can_manage(company_id)) WITH CHECK (public.ct_can_manage(company_id));

CREATE TABLE public.ct_case_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.ct_activity_cases(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  note text NOT NULL,
  author_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ct_case_notes_case_idx ON public.ct_case_notes(case_id);
GRANT SELECT, INSERT ON public.ct_case_notes TO authenticated;
GRANT ALL ON public.ct_case_notes TO service_role;
ALTER TABLE public.ct_case_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ct_case_notes_view" ON public.ct_case_notes FOR SELECT TO authenticated USING (public.ct_can_view(company_id));
CREATE POLICY "ct_case_notes_insert" ON public.ct_case_notes FOR INSERT TO authenticated WITH CHECK (public.ct_can_manage(company_id));

CREATE TRIGGER ct_issuers_updated BEFORE UPDATE ON public.ct_issuers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ct_claim_invites_updated BEFORE UPDATE ON public.ct_claim_invites FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ct_exposure_claims_updated BEFORE UPDATE ON public.ct_exposure_claims FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ct_claim_documents_updated BEFORE UPDATE ON public.ct_claim_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ct_activity_cases_updated BEFORE UPDATE ON public.ct_activity_cases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
