-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','super_admin','operations','legal','compliance',
                   'fund_administration','tax','finance','client_success','executive')
  )
$$;

CREATE OR REPLACE FUNCTION private.can_manage_contracts(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','super_admin','legal','client_success','compliance','finance')
  )
$$;

-- ---------- clients ----------
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  status text NOT NULL DEFAULT 'active',
  msa_signed_on date,
  msa_version text,
  msa_document_path text,
  primary_contact_name text,
  primary_contact_email text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.client_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  client_role text NOT NULL DEFAULT 'client_readonly',
  can_approve boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_users TO authenticated;
GRANT ALL ON public.client_users TO service_role;
ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.offerings ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION private.client_visible(_user_id uuid, _client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.is_staff(_user_id)
     OR EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = _client_id AND cu.user_id = _user_id)
     OR EXISTS (
          SELECT 1 FROM public.fund_managers fm
          JOIN public.offerings o ON o.id = fm.offering_id
          WHERE fm.user_id = _user_id AND o.client_id = _client_id)
$$;

CREATE POLICY "clients readable by their people" ON public.clients FOR SELECT TO authenticated
  USING (private.client_visible(auth.uid(), id));
CREATE POLICY "clients managed by contract staff" ON public.clients FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));

CREATE POLICY "client users readable" ON public.client_users FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.client_visible(auth.uid(), client_id));
CREATE POLICY "client users managed" ON public.client_users FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));

-- ---------- statements of work ----------
CREATE TABLE public.client_sows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  title text NOT NULL,
  sow_type text NOT NULL DEFAULT 'spv',
  status text NOT NULL DEFAULT 'draft',
  effective_date date,
  termination_date date,
  notice_days integer NOT NULL DEFAULT 60,
  document_path text,
  signed_by text,
  signed_on date,
  eligibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_sows TO authenticated;
GRANT ALL ON public.client_sows TO service_role;
ALTER TABLE public.client_sows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sows readable by their people" ON public.client_sows FOR SELECT TO authenticated
  USING (private.client_visible(auth.uid(), client_id));
CREATE POLICY "sows managed by contract staff" ON public.client_sows FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));

-- ---------- service catalog ----------
CREATE TABLE public.service_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  description text,
  default_pricing_model text NOT NULL DEFAULT 'one_time',
  harmonious_handles text,
  client_handles text,
  third_party_handles text,
  required_documents text[] NOT NULL DEFAULT '{}',
  required_approvals text[] NOT NULL DEFAULT '{}',
  required_checks text[] NOT NULL DEFAULT '{}',
  third_party_dependency text,
  material boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_catalog TO authenticated;
GRANT ALL ON public.service_catalog TO service_role;
ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog readable" ON public.service_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalog managed" ON public.service_catalog FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));

CREATE TABLE public.service_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sow_id uuid REFERENCES public.client_sows(id) ON DELETE SET NULL,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE CASCADE,
  service_key text NOT NULL REFERENCES public.service_catalog(key) ON UPDATE CASCADE,
  status text NOT NULL DEFAULT 'not_included',
  pricing_model text,
  effective_date date,
  termination_date date,
  harmonious_handles text,
  client_handles text,
  third_party_handles text,
  required_approvals text[] NOT NULL DEFAULT '{}',
  required_documents text[] NOT NULL DEFAULT '{}',
  required_checks text[] NOT NULL DEFAULT '{}',
  third_party_dependency text,
  note text,
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX service_entitlements_scope_idx
  ON public.service_entitlements (client_id, COALESCE(offering_id, '00000000-0000-0000-0000-000000000000'::uuid), service_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_entitlements TO authenticated;
GRANT ALL ON public.service_entitlements TO service_role;
ALTER TABLE public.service_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entitlements readable by their people" ON public.service_entitlements FOR SELECT TO authenticated
  USING (private.client_visible(auth.uid(), client_id));
CREATE POLICY "entitlements managed" ON public.service_entitlements FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));

-- ---------- pricing ----------
CREATE TABLE public.pricing_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  effective_date date,
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_versions TO authenticated;
GRANT ALL ON public.pricing_versions TO service_role;
ALTER TABLE public.pricing_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing versions readable" ON public.pricing_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "pricing versions managed" ON public.pricing_versions FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));

CREATE TABLE public.pricing_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.pricing_versions(id) ON DELETE CASCADE,
  service_key text,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  pricing_model text NOT NULL DEFAULT 'one_time',
  amount_cents bigint,
  unit text,
  condition text,
  pass_through boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_items TO authenticated;
GRANT ALL ON public.pricing_items TO service_role;
ALTER TABLE public.pricing_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing items readable" ON public.pricing_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "pricing items managed" ON public.pricing_items FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));

CREATE TABLE public.client_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sow_id uuid REFERENCES public.client_sows(id) ON DELETE SET NULL,
  service_key text,
  label text NOT NULL,
  standard_cents bigint,
  contracted_cents bigint,
  discount_note text,
  pricing_model text NOT NULL DEFAULT 'one_time',
  version_id uuid REFERENCES public.pricing_versions(id) ON DELETE SET NULL,
  effective_date date,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_pricing TO authenticated;
GRANT ALL ON public.client_pricing TO service_role;
ALTER TABLE public.client_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client pricing readable by their people" ON public.client_pricing FOR SELECT TO authenticated
  USING (private.client_visible(auth.uid(), client_id));
CREATE POLICY "client pricing managed" ON public.client_pricing FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));

-- ---------- change of scope ----------
CREATE TABLE public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  service_key text NOT NULL,
  status text NOT NULL DEFAULT 'submitted',
  requested_by uuid,
  requester_note text,
  reviewer_id uuid,
  review_note text,
  proposed_fee_cents bigint,
  proposed_pricing_model text,
  amendment_path text,
  client_approved_by uuid,
  client_approved_at timestamptz,
  activated_entitlement_id uuid REFERENCES public.service_entitlements(id) ON DELETE SET NULL,
  effective_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_requests TO authenticated;
GRANT ALL ON public.service_requests TO service_role;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service requests readable by their people" ON public.service_requests FOR SELECT TO authenticated
  USING (private.client_visible(auth.uid(), client_id));
CREATE POLICY "service requests raised by their people" ON public.service_requests FOR INSERT TO authenticated
  WITH CHECK (private.client_visible(auth.uid(), client_id) AND requested_by = auth.uid());
CREATE POLICY "service requests managed" ON public.service_requests FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));

-- ---------- third-party providers ----------
CREATE TABLE public.third_party_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider_type text NOT NULL,
  service_dependency text,
  data_categories text[] NOT NULL DEFAULT '{}',
  contract_status text NOT NULL DEFAULT 'active',
  security_doc_url text,
  sla text,
  status text NOT NULL DEFAULT 'operational',
  outage_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.third_party_providers TO authenticated;
GRANT ALL ON public.third_party_providers TO service_role;
ALTER TABLE public.third_party_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "providers readable" ON public.third_party_providers FOR SELECT TO authenticated USING (true);
CREATE POLICY "providers managed" ON public.third_party_providers FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));

-- ---------- compliance holds ----------
CREATE TABLE public.compliance_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE CASCADE,
  subject_user_id uuid,
  scope text NOT NULL,
  service_key text,
  reason text NOT NULL,
  internal_note text,
  client_explanation text,
  remediation text,
  status text NOT NULL DEFAULT 'active',
  placed_by uuid,
  placed_at timestamptz NOT NULL DEFAULT now(),
  cleared_by uuid,
  cleared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_holds TO authenticated;
GRANT ALL ON public.compliance_holds TO service_role;
ALTER TABLE public.compliance_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "holds readable by affected people" ON public.compliance_holds FOR SELECT TO authenticated
  USING (
    private.is_staff(auth.uid())
    OR subject_user_id = auth.uid()
    OR (client_id IS NOT NULL AND private.client_visible(auth.uid(), client_id))
    OR (offering_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = compliance_holds.offering_id AND fm.user_id = auth.uid()))
  );
CREATE POLICY "holds managed by staff" ON public.compliance_holds FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

-- ---------- payment instructions ----------
CREATE TABLE public.payment_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT 'outbound',
  purpose text NOT NULL,
  amount_cents bigint NOT NULL,
  originating_account text,
  beneficiary_name text,
  beneficiary_account text,
  supporting_document_path text,
  requested_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  dual_approval_required boolean NOT NULL DEFAULT true,
  verification_status text NOT NULL DEFAULT 'pending',
  callback_status text NOT NULL DEFAULT 'not_required',
  callback_note text,
  compliance_status text NOT NULL DEFAULT 'pending',
  bank_status text NOT NULL DEFAULT 'not_sent',
  status text NOT NULL DEFAULT 'draft',
  pause_reason text,
  authorization_reference text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_instructions TO authenticated;
GRANT ALL ON public.payment_instructions TO service_role;
ALTER TABLE public.payment_instructions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment instructions readable" ON public.payment_instructions FOR SELECT TO authenticated
  USING (
    private.is_staff(auth.uid())
    OR requested_by = auth.uid()
    OR (offering_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = payment_instructions.offering_id AND fm.user_id = auth.uid()))
  );
CREATE POLICY "payment instructions managed by staff" ON public.payment_instructions FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE TABLE public.payment_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instruction_id uuid NOT NULL REFERENCES public.payment_instructions(id) ON DELETE CASCADE,
  approver_id uuid NOT NULL,
  approver_role text,
  decision text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instruction_id, approver_id)
);
GRANT SELECT, INSERT ON public.payment_approvals TO authenticated;
GRANT ALL ON public.payment_approvals TO service_role;
ALTER TABLE public.payment_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment approvals readable by staff" ON public.payment_approvals FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "payment approvals written by staff" ON public.payment_approvals FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()) AND approver_id = auth.uid());

-- ---------- governance ----------
CREATE TABLE public.marketing_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name_permitted boolean NOT NULL DEFAULT false,
  logo_permitted boolean NOT NULL DEFAULT false,
  testimonial_permitted boolean NOT NULL DEFAULT false,
  case_study_permitted boolean NOT NULL DEFAULT false,
  authorized_use text,
  authorized_on date,
  expires_on date,
  document_path text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_releases TO authenticated;
GRANT ALL ON public.marketing_releases TO service_role;
ALTER TABLE public.marketing_releases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing releases readable" ON public.marketing_releases FOR SELECT TO authenticated
  USING (private.client_visible(auth.uid(), client_id));
CREATE POLICY "marketing releases managed" ON public.marketing_releases FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));

CREATE TABLE public.record_retention (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  record_label text NOT NULL,
  data_classification text NOT NULL DEFAULT 'client_confidential',
  retention_category text NOT NULL DEFAULT 'contractual',
  status text NOT NULL DEFAULT 'active',
  retain_until date,
  legal_hold boolean NOT NULL DEFAULT false,
  hold_reason text,
  note text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.record_retention TO authenticated;
GRANT ALL ON public.record_retention TO service_role;
ALTER TABLE public.record_retention ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retention readable by staff" ON public.record_retention FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "retention managed" ON public.record_retention FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));

CREATE TABLE public.offboarding_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sow_id uuid REFERENCES public.client_sows(id) ON DELETE SET NULL,
  notice_received_on date,
  notice_days integer NOT NULL DEFAULT 60,
  effective_end_date date,
  status text NOT NULL DEFAULT 'open',
  steps jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offboarding_cases TO authenticated;
GRANT ALL ON public.offboarding_cases TO service_role;
ALTER TABLE public.offboarding_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offboarding readable" ON public.offboarding_cases FOR SELECT TO authenticated
  USING (private.client_visible(auth.uid(), client_id));
CREATE POLICY "offboarding managed" ON public.offboarding_cases FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));

CREATE TABLE public.ai_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  feature text NOT NULL,
  action text NOT NULL,
  summary text,
  human_review_required boolean NOT NULL DEFAULT false,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_action_log TO authenticated;
GRANT ALL ON public.ai_action_log TO service_role;
ALTER TABLE public.ai_action_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai log readable by staff" ON public.ai_action_log FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "ai log written by signed-in users" ON public.ai_action_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

CREATE TABLE public.contract_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  area text NOT NULL,
  action text NOT NULL,
  target text,
  previous_value jsonb,
  new_value jsonb,
  approval text,
  source text,
  supporting_document text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.contract_audit_events TO authenticated;
GRANT ALL ON public.contract_audit_events TO service_role;
ALTER TABLE public.contract_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contract audit readable by staff" ON public.contract_audit_events FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "contract audit written by signed-in users" ON public.contract_audit_events FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- ---------- updated_at triggers ----------
CREATE TRIGGER clients_updated BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER client_sows_updated BEFORE UPDATE ON public.client_sows FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER service_catalog_updated BEFORE UPDATE ON public.service_catalog FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER service_entitlements_updated BEFORE UPDATE ON public.service_entitlements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER pricing_versions_updated BEFORE UPDATE ON public.pricing_versions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER client_pricing_updated BEFORE UPDATE ON public.client_pricing FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER service_requests_updated BEFORE UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER providers_updated BEFORE UPDATE ON public.third_party_providers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER holds_updated BEFORE UPDATE ON public.compliance_holds FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER payment_instructions_updated BEFORE UPDATE ON public.payment_instructions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER marketing_releases_updated BEFORE UPDATE ON public.marketing_releases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER record_retention_updated BEFORE UPDATE ON public.record_retention FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER offboarding_updated BEFORE UPDATE ON public.offboarding_cases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- seed: service catalog ----------
INSERT INTO public.service_catalog (key, name, category, description, default_pricing_model, harmonious_handles, client_handles, third_party_handles, material, sort_order) VALUES
('entity_formation','U.S. entity formation','formation','Administrative coordination of entity formation.','one_time','Prepares and files formation paperwork with the chosen provider and keeps the record.','Chooses the structure, jurisdiction and names; approves the documents.','State filing offices and registered agents process and approve filings.',true,10),
('delaware_formation','Delaware formation','formation','Delaware entity formation coordination.','one_time','Coordinates the Delaware filing and keeps the record.','Approves the structure and names.','Delaware Division of Corporations and the registered agent.',true,20),
('ein_ss4','EIN / SS-4 coordination','formation','Preparation and submission support for Form SS-4.','one_time','Prepares the SS-4 from the information supplied and submits it.','Provides responsible-party details and signs.','The IRS issues the EIN on its own timetable.',false,30),
('registered_agent','Registered agent coordination','formation','Coordination with the registered agent.','annual','Arranges and renews the appointment.','Approves the appointment and pays the fee.','The registered agent performs the service.',false,40),
('management_llc','Management / Master LLC support','formation','Delaware management or master LLC administration.','annual','Administers the entity records.','Approves the structure.','State filing offices.',true,50),
('governing_documents','Governing-document coordination','formation','Collecting and circulating governing documents.','one_time','Collects, circulates and files executed documents.','Instructs counsel and approves the terms.','Counsel drafts and advises.',false,60),
('investor_onboarding','Investor onboarding','onboarding','Investor intake and document collection.','recurring','Runs the onboarding workflow and records.','Approves each investor.','Identity and screening vendors.',false,70),
('kyc','KYC screening','onboarding','Individual identity checks.','transaction','Runs the checks and records the outcome.','Reviews and accepts the result.','KYC vendor performs the check.',false,80),
('kyb','KYB screening','onboarding','Entity verification checks.','transaction','Runs the checks and records the outcome.','Provides entity documents.','KYB vendor performs the check.',false,90),
('aml_screening','AML screening','onboarding','Anti-money-laundering screening.','transaction','Runs screening and escalates matches.','Responds to questions raised.','Screening vendor maintains the lists.',false,100),
('sanctions_screening','Sanctions screening','onboarding','Sanctions list screening.','transaction','Runs screening and escalates matches.','Responds to questions raised.','Screening vendor maintains the lists.',false,110),
('beneficial_owner_screening','Beneficial-owner screening','onboarding','Beneficial ownership collection and screening.','transaction','Collects and screens owner details.','Discloses beneficial owners.','Screening vendor.',false,120),
('accreditation_506b','Rule 506(b) onboarding','onboarding','Collection of accreditation representations.','recurring','Collects representations and documentation.','Confirms the pre-existing relationship and accepts the investor.','None.',false,130),
('accreditation_506c','Rule 506(c) verification','onboarding','Reasonable verification of accredited status.','transaction','Runs the verification workflow and records evidence.','Accepts or rejects the investor.','Verification providers, CPAs and attorneys.',false,140),
('tax_doc_collection','W-9 / W-8 collection','onboarding','Tax form collection from investors.','recurring','Collects and stores the forms.','Confirms the classification is correct.','None.',false,150),
('subscription_docs','Subscription-document collection','onboarding','Subscription document circulation and collection.','recurring','Circulates, collects and files executed documents.','Approves the documents and countersigns.','E-signature provider.',false,160),
('investor_records','Investor records','administration','Investor and ownership recordkeeping.','annual','Maintains investor records and ownership.','Supplies accurate investor information.','None.',false,170),
('capital_accounts','Capital-account tracking','administration','Capital accounts and book entries.','annual','Maintains capital accounts from the information supplied.','Approves the entries and valuations.','None.',false,180),
('fund_expenses','Fund expense administration','administration','Recording and paying fund expenses.','annual','Records expenses and prepares payments.','Approves each expense.','Banks process payments.',false,190),
('investor_inquiries','Investor inquiries','administration','Handling investor questions.','annual','Responds to administrative questions.','Answers investment questions.','None.',false,200),
('distributions','Cash distributions','administration','Distribution calculation and payment support.','transaction','Calculates and prepares distributions.','Approves the distribution.','Banks move the money.',true,210),
('in_kind_distributions','In-kind distributions','administration','In-kind distribution support.','transaction','Records and coordinates the transfer.','Approves and instructs.','Transfer agents and custodians.',true,220),
('capital_calls','Capital calls','administration','Capital call notices and tracking.','transaction','Issues notices and tracks receipts.','Approves the call.','Banks receive the funds.',true,230),
('additional_close','Additional closes','administration','Additional closing support.','transaction','Runs the closing workflow.','Approves the close.','None.',true,240),
('additional_asset','Additional assets','administration','Adding an asset to the vehicle.','transaction','Records the asset and updates books.','Selects and approves the asset.','None.',true,250),
('membership_transfer','Membership transfers','administration','Transfer of interests.','transaction','Processes and records the transfer.','Approves the transfer.','Counsel where required.',true,260),
('side_letters','Side letters','administration','Side letter administration.','transaction','Records and applies agreed terms.','Negotiates and signs.','Counsel drafts.',true,270),
('wind_down','Fund wind-down','administration','Wind-down administration.','one_time','Runs the wind-down checklist.','Approves the wind-down.','Counsel, banks and state offices.',true,280),
('dissolution','Entity dissolution','administration','Entity dissolution coordination.','one_time','Prepares and files dissolution paperwork.','Approves the dissolution.','State filing offices.',true,290),
('bank_setup','Bank-account setup or coordination','banking','Coordinating a fund bank account.','one_time','Prepares the application and coordinates with the bank.','Signs as authorised party and approves.','The bank decides whether to open the account.',false,300),
('funding_tracking','Investor funding tracking','banking','Tracking incoming investor funds.','annual','Records and reconciles incoming funds.','Confirms receipt where required.','Banks report the activity.',false,310),
('wire_instructions','Wire-instruction management','banking','Holding and releasing wire instructions.','annual','Stores instructions and controls release.','Provides and confirms the details.','Banks execute the payment.',false,320),
('payment_approvals','Payment approvals','banking','Dual approval and verification of payments.','annual','Runs approval, verification and callback checks.','Authorises each payment.','Banks execute the payment.',true,330),
('form_d','Form D filing support','filings','Form D preparation and submission support.','one_time','Prepares and submits the filing from the information supplied.','Provides the information and approves the filing.','EDGAR processes the filing.',false,340),
('blue_sky','Blue Sky filing support','filings','State notice filings.','transaction','Prepares and submits state notice filings.','Provides the information and pays state fees.','State regulators process the filings.',false,350),
('filing_tracking','Filing-deadline tracking','filings','Tracking filing deadlines and status.','annual','Tracks deadlines and required inputs.','Supplies information on time.','Regulators set the deadlines.',false,360),
('tax_1065','Federal partnership return coordination','tax','Coordination of Form 1065 with the accounting partner.','annual','Coordinates and supplies records to the accountant.','Approves the return and engages the accountant.','The accounting firm prepares and signs the return.',false,370),
('tax_state','State partnership return coordination','tax','State return coordination.','annual','Coordinates and supplies records.','Approves the return.','The accounting firm prepares the return.',false,380),
('tax_k1','Schedule K-1 coordination','tax','K-1 preparation coordination and distribution.','annual','Coordinates and distributes the K-1s.','Approves the allocations.','The accounting firm prepares the K-1s.',false,390),
('tax_1042s','Form 1042-S coordination','tax','1042-S coordination.','annual','Coordinates and distributes the forms.','Approves the information.','The accounting firm prepares the forms.',false,400),
('financial_statements','Financial statements','reporting','Unaudited financial statements.','transaction','Prepares statements from the records held. These are not audited or reviewed and carry no assurance.','Approves the statements and valuations.','Auditors only if separately engaged.',true,410),
('capital_account_statements','Capital-account statements','reporting','Standard capital-account statements.','annual','Produces standard statements.','Approves the underlying values.','None.',false,420),
('investor_reporting','Investor reporting','reporting','Reporting to investors.','annual','Produces and circulates reports.','Approves the content.','None.',false,430);

-- ---------- seed: current SPV pricing ----------
INSERT INTO public.pricing_versions (id, label, status, effective_date, published_at)
VALUES ('11111111-1111-4111-8111-111111111111','SPV SOW pricing (current)','published', CURRENT_DATE, now());

INSERT INTO public.pricing_items (version_id, service_key, label, category, pricing_model, amount_cents, unit, condition, pass_through, sort_order) VALUES
('11111111-1111-4111-8111-111111111111', NULL,'SPV under $250,000','formation','one_time',500000,'per SPV','Total raise under $250,000',false,10),
('11111111-1111-4111-8111-111111111111', NULL,'SPV $250,000–$1,000,000','formation','one_time',750000,'per SPV','Total raise $250,000 to $1,000,000',false,20),
('11111111-1111-4111-8111-111111111111', NULL,'SPV over $1,000,000','formation','one_time',1000000,'per SPV','Total raise over $1,000,000',false,30),
('11111111-1111-4111-8111-111111111111','management_llc','Delaware Management LLC','formation','annual',200000,'per year',NULL,false,40),
('11111111-1111-4111-8111-111111111111','management_llc','Delaware Master LLC','formation','annual',250000,'per year',NULL,false,50),
('11111111-1111-4111-8111-111111111111','tax_k1','K-1 / 1065 / 1042-S services','tax','annual',250000,'per taxable year','After the first applicable taxable year unless otherwise stated',false,60),
('11111111-1111-4111-8111-111111111111','capital_calls','Capital call','administration','transaction',200000,'per call',NULL,false,70),
('11111111-1111-4111-8111-111111111111','additional_close','Additional close','administration','transaction',200000,'per close',NULL,false,80),
('11111111-1111-4111-8111-111111111111','additional_asset','Additional asset','administration','transaction',200000,'per asset',NULL,false,90),
('11111111-1111-4111-8111-111111111111','financial_statements','Financial statements','reporting','transaction',250000,'per set',NULL,false,100),
('11111111-1111-4111-8111-111111111111','side_letters','Side letter','administration','transaction',100000,'per letter',NULL,false,110),
('11111111-1111-4111-8111-111111111111','distributions','Additional cash distribution','administration','transaction',200000,'per event',NULL,false,120),
('11111111-1111-4111-8111-111111111111','investor_records','More than 20 investors','administration','transaction',5000,'per additional investor',NULL,false,130),
('11111111-1111-4111-8111-111111111111','membership_transfer','Membership transfer','administration','transaction',150000,'per transfer',NULL,false,140),
('11111111-1111-4111-8111-111111111111','blue_sky','Blue Sky filings','filings','pass_through',NULL,'state fees','Applicable state fees',true,150),
('11111111-1111-4111-8111-111111111111','dissolution','Entity shutdown / dissolution','administration','one_time',150000,'per entity','Plus state fees',false,160);

-- ---------- seed: third-party providers ----------
INSERT INTO public.third_party_providers (name, provider_type, service_dependency, data_categories, contract_status, status) VALUES
('Microsoft Azure','infrastructure','Hosting and storage','{"client_confidential","investor_confidential"}','active','operational'),
('Google','infrastructure','Authentication and productivity','{"client_confidential"}','active','operational'),
('Banking partners','bank','Account opening, wires and distributions','{"banking","transaction"}','active','operational'),
('KYC / KYB vendor','screening','Identity, AML and sanctions screening','{"kyc_kyb"}','active','operational'),
('Accounting partner','tax','Partnership returns, K-1 and 1042-S preparation','{"tax"}','active','operational'),
('Registered agent','registered_agent','Entity formation and agent of record','{"client_confidential"}','active','operational'),
('Government filing systems','government','EDGAR, state regulators and the IRS','{"regulatory"}','n/a','operational'),
('E-signature provider','software','Document execution','{"client_confidential","investor_confidential"}','active','operational');