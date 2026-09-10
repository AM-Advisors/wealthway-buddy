CREATE TABLE public.eligibility_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  rule_type text NOT NULL DEFAULT 'boolean',
  default_value jsonb NOT NULL DEFAULT 'true'::jsonb,
  blocking boolean NOT NULL DEFAULT true,
  applies_to text NOT NULL DEFAULT 'fund',
  source_reference text,
  sort_order integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eligibility_rules TO authenticated;
GRANT ALL ON public.eligibility_rules TO service_role;
ALTER TABLE public.eligibility_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eligibility rules readable" ON public.eligibility_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "eligibility rules managed" ON public.eligibility_rules FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));
CREATE TRIGGER eligibility_rules_updated_at BEFORE UPDATE ON public.eligibility_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.responsibility_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  detail text,
  owner text NOT NULL DEFAULT 'client',
  phase text NOT NULL DEFAULT 'formation',
  service_key text,
  lead_time_note text,
  source_reference text,
  sort_order integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.responsibility_templates TO authenticated;
GRANT ALL ON public.responsibility_templates TO service_role;
ALTER TABLE public.responsibility_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "responsibility templates readable" ON public.responsibility_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "responsibility templates managed" ON public.responsibility_templates FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));
CREATE TRIGGER responsibility_templates_updated_at BEFORE UPDATE ON public.responsibility_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.responsibility_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE CASCADE,
  template_key text,
  label text NOT NULL,
  detail text,
  owner text NOT NULL DEFAULT 'client',
  phase text NOT NULL DEFAULT 'formation',
  status text NOT NULL DEFAULT 'outstanding',
  due_on date,
  completed_by uuid,
  completed_at timestamptz,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.responsibility_items TO authenticated;
GRANT ALL ON public.responsibility_items TO service_role;
ALTER TABLE public.responsibility_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "responsibility items readable by their people" ON public.responsibility_items FOR SELECT TO authenticated
  USING (
    private.is_staff(auth.uid())
    OR (client_id IS NOT NULL AND private.client_visible(auth.uid(), client_id))
    OR (offering_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = responsibility_items.offering_id AND fm.user_id = auth.uid()))
  );
CREATE POLICY "responsibility items updated by their people" ON public.responsibility_items FOR UPDATE TO authenticated
  USING (
    private.is_staff(auth.uid())
    OR (client_id IS NOT NULL AND private.client_visible(auth.uid(), client_id))
    OR (offering_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = responsibility_items.offering_id AND fm.user_id = auth.uid()))
  )
  WITH CHECK (
    private.is_staff(auth.uid())
    OR (client_id IS NOT NULL AND private.client_visible(auth.uid(), client_id))
    OR (offering_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = responsibility_items.offering_id AND fm.user_id = auth.uid()))
  );
CREATE POLICY "responsibility items managed by staff" ON public.responsibility_items FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE TRIGGER responsibility_items_updated_at BEFORE UPDATE ON public.responsibility_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.eligibility_rules (key, label, description, rule_type, default_value, blocking, applies_to, source_reference, sort_order) VALUES
('accredited_investors_only','All investors must be accredited','Harmonious does not administer a fund with any investor who is not accredited under Rule 501 of Regulation D.','boolean','true'::jsonb,true,'investor','SOW Other Terms 4 and 9(a)',10),
('max_beneficial_owners','Beneficial owner limit','A 3(c)(1) fund may not exceed 99 beneficial owners, or 249 for a qualifying venture capital fund.','number','99'::jsonb,true,'fund','SOW Other Terms 4',20),
('allowed_exemptions','Allowed offering exemptions','An SPV must rely on Rule 506(b) or Rule 506(c) unless Harmonious approves another structure in writing.','list','["506b","506c"]'::jsonb,true,'fund','SOW Other Terms 8(c)',30),
('series_of_master_llc','Must be a series of a master LLC','Every SPV must be formed as a series of a master LLC.','boolean','true'::jsonb,true,'fund','SOW Other Terms 8(a)',40),
('harmonious_templates_with_master_llc','Harmonious templates required with the Harmonious master LLC','Using the Harmonious master LLC requires the Harmonious SPV document templates.','boolean','true'::jsonb,true,'fund','SOW Other Terms 8(b)',50),
('single_class_structure','Single class structure','Every SPV must have a single class of interests.','boolean','true'::jsonb,true,'fund','SOW Other Terms 8(f)',60),
('approved_bank_account','Bank account established or approved by Harmonious','The fund must use a bank account established through or approved by Harmonious unless agreed otherwise in writing.','boolean','true'::jsonb,true,'fund','SOW Other Terms 8(e)',70),
('usd_only','US dollars only','All payments from and to investors must be in US dollars.','boolean','true'::jsonb,true,'fund','SOW Other Terms 6',80),
('capital_calls_require_approval','Capital calls need written approval','Capital calls and capital-call calculations need written approval and the applicable fee.','boolean','true'::jsonb,true,'fund','SOW Other Terms 9(d)',90),
('additional_assets_require_approval','Follow-on rounds and additional assets need written approval','Follow-on rounds, pro rata exercises and additional assets need written approval and the applicable fee.','boolean','true'::jsonb,true,'fund','SOW Other Terms 9(b)',100),
('expense_reserve_requires_approval','Expense reserve and audit support need written approval','An expense reserve or audit support is out of scope unless expressly included or approved in writing.','boolean','true'::jsonb,true,'fund','SOW Other Terms 9(c)',110),
('no_pfic_cfc','No PFIC or CFC investments','An SPV may not invest in a passive foreign investment company or a controlled foreign corporation.','boolean','true'::jsonb,true,'fund','SOW Other Terms 9(e)',120),
('investor_count_fee_threshold','Additional investor fee threshold','Above this number of investors, the per-additional-investor fee applies.','number','20'::jsonb,false,'fund','Exhibit A',130),
('filing_information_lead_days','Filing information lead time','Client provides Form D and Blue Sky information at least this many business days before a filing deadline.','number','10'::jsonb,false,'operational','Client Responsibilities 6(X)',140),
('tax_information_lead_days','Tax information lead time','Client provides tax information at least this many days before the filing deadline.','number','90'::jsonb,false,'operational','Appendix A 8(c)',150),
('client_response_days','Client response time','Client responds to Harmonious requests within this many business days.','number','3'::jsonb,false,'operational','SOW Other Terms 1',160),
('custody_excluded','Harmonious does not act as custodian','Harmonious will not provide, engage or maintain a custodian to hold fund investments.','boolean','true'::jsonb,true,'fund','SOW Other Terms 5',170);

INSERT INTO public.responsibility_templates (key, label, detail, owner, phase, service_key, lead_time_note, source_reference, sort_order) VALUES
('formation_notice','Send the formation notice','Fund name, state of formation, target raise, the entities being invested in, the exemption relied on, a description of the investment, and the fund terms including carry and management fee.','client','formation',NULL,NULL,'Client Responsibilities 1',10),
('ss4_information','Provide the information for Form SS-4','Everything Harmonious needs to obtain the fund''s EIN from the IRS.','client','formation',NULL,NULL,'Client Responsibilities 2',20),
('operating_agreement','Adopt the operating or limited partnership agreement','Direct the fund to adopt the agreement, which Harmonious approves.','client','formation',NULL,NULL,'Client Responsibilities 5',30),
('exemption_selection','Choose and maintain the offering exemption','Client selects the exemption and remains responsible for the legal compliance of the offering.','client','formation',NULL,NULL,'Client Responsibilities 1(V) and 3',40),
('accreditation_506c','Arrange accredited-investor verification for 506(c)','Reasonable verification steps through Harmonious or another approved process. Not required for 506(b) unless law or written agreement requires it.','client','onboarding',NULL,NULL,'Client Responsibilities 3',50),
('investor_documents','Get investor documents to Harmonious','Subscription documents, Form W-9 and related paperwork. Chasing investors for documents is the client''s job, not Harmonious''.','client','onboarding',NULL,NULL,'Client Responsibilities 1(X)',60),
('kyc_kyb_aml','Complete and pass KYC, KYB and AML','Client and its investors complete screening; Harmonious performs or coordinates it only where included in scope.','client','onboarding',NULL,NULL,'Client Responsibilities 8',70),
('collect_capital','Make sure the fund collects the capital','Client ensures investors actually fund their commitments.','client','funding',NULL,NULL,'Client Responsibilities 1(XI)',80),
('investor_bank_details','Provide investor banking details for distributions','Current banking information for each investor.','client','distribution',NULL,NULL,'Client Responsibilities 4',90),
('form_d_information','Provide Form D and Blue Sky information','Related persons, offering type and exemption, date of first sale, securities type, minimum subscription, broker-dealer details and commissions, total sold and investor count, proceeds paid to the manager, and date of first sale to each investor.','client','filings',NULL,'At least 10 business days before any filing deadline.','Client Responsibilities 6',100),
('franchise_fees','Pay franchise fees','Including Delaware franchise tax where applicable.','client','administration',NULL,NULL,'Client Responsibilities 7',110),
('valuations','Set valuations and valuation methods','Client is solely responsible for valuation techniques and the valuations themselves.','client','reporting',NULL,NULL,'SOW Other Terms 3',120),
('direct_investment','Direct the fund''s purchase or sale','Timing, price and every other commercially significant aspect of the investment.','client','investment',NULL,NULL,'Client Responsibilities 1(IX)',130),
('respond_promptly','Respond to Harmonious within 3 business days','Answer questions, provide documents and review what Harmonious sends.','client','ongoing',NULL,'Within 3 business days.','SOW Other Terms 1',140),
('authorized_contacts','Keep authorised people and credentials current','Designate a qualified primary contact, keep the authorised-user list current, and report suspected fraud or compromise promptly.','client','ongoing',NULL,NULL,'MSA 5, 5.3',150),
('tax_information','Provide tax information on time','Everything the accounting partners need for the partnership return, K-1s and Form 1042-S.','client','tax',NULL,'At least 90 days before the filing deadline.','Appendix A 8(c)',160);