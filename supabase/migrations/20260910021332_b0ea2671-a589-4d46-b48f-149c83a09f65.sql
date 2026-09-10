CREATE OR REPLACE FUNCTION private.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _user_id AND r.role::text IN ('super_admin','admin'))
$$;

CREATE TABLE public.fund_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL UNIQUE REFERENCES public.offerings(id) ON DELETE CASCADE,
  prior_administrator text,
  records_as_of date,
  status text NOT NULL DEFAULT 'not_started',
  steps jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_migrations TO authenticated;
GRANT ALL ON public.fund_migrations TO service_role;
ALTER TABLE public.fund_migrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "migrations manageable by super admins" ON public.fund_migrations FOR ALL TO authenticated
  USING (private.is_super_admin(auth.uid())) WITH CHECK (private.is_super_admin(auth.uid()));
CREATE POLICY "migrations readable by staff" ON public.fund_migrations FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE TRIGGER fund_migrations_updated BEFORE UPDATE ON public.fund_migrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.fund_migration_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_id uuid NOT NULL REFERENCES public.fund_migrations(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  investor_type text,
  commitment_cents bigint NOT NULL DEFAULT 0,
  funded_cents bigint NOT NULL DEFAULT 0,
  units numeric,
  closing_date date,
  accreditation_status text,
  note text,
  row_status text NOT NULL DEFAULT 'pending',
  error_text text,
  application_id uuid REFERENCES public.investor_applications(id) ON DELETE SET NULL,
  imported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_migration_rows TO authenticated;
GRANT ALL ON public.fund_migration_rows TO service_role;
ALTER TABLE public.fund_migration_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "migration rows manageable by super admins" ON public.fund_migration_rows FOR ALL TO authenticated
  USING (private.is_super_admin(auth.uid())) WITH CHECK (private.is_super_admin(auth.uid()));
CREATE POLICY "migration rows readable by staff" ON public.fund_migration_rows FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE INDEX fund_migration_rows_migration_idx ON public.fund_migration_rows(migration_id);
CREATE TRIGGER fund_migration_rows_updated BEFORE UPDATE ON public.fund_migration_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.policy_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  effective_date date NOT NULL DEFAULT current_date,
  published boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.policy_documents TO authenticated;
GRANT ALL ON public.policy_documents TO service_role;
ALTER TABLE public.policy_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "policies manageable by super admins" ON public.policy_documents FOR ALL TO authenticated
  USING (private.is_super_admin(auth.uid())) WITH CHECK (private.is_super_admin(auth.uid()));
CREATE POLICY "published policies readable" ON public.policy_documents FOR SELECT TO authenticated
  USING (published = true);
CREATE TRIGGER policy_documents_updated BEFORE UPDATE ON public.policy_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.policy_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  document_id uuid NOT NULL REFERENCES public.policy_documents(id) ON DELETE CASCADE,
  kind text NOT NULL,
  version integer NOT NULL,
  signer_name text NOT NULL,
  email text,
  ip_address text,
  user_agent text,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, document_id)
);
GRANT SELECT, INSERT ON public.policy_acceptances TO authenticated;
GRANT ALL ON public.policy_acceptances TO service_role;
ALTER TABLE public.policy_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own acceptances readable" ON public.policy_acceptances FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_super_admin(auth.uid()));
CREATE POLICY "own acceptances insertable" ON public.policy_acceptances FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

INSERT INTO public.policy_documents (kind, title, body, version, published) VALUES
('privacy', 'Privacy notice', 'Harmonious collects and processes information you and your fund provide in order to deliver administrative, onboarding, recordkeeping, reporting and payment-facilitation services. Information is shared only with the service providers, banks and government systems needed to deliver those services, or where required by law. Records may be retained after an engagement ends for legal, regulatory, audit and claims purposes. Your information is not used to train unrelated public artificial-intelligence systems.', 1, true),
('terms', 'Platform terms of use', 'This platform is provided by Harmonious as an administrative and technology service. Services are governed by your Master Service Agreement and each applicable Statement of Work; anything outside your active scope is not provided. Harmonious does not act as an investment adviser, broker-dealer, placement agent, custodian, transfer agent, escrow agent, trustee, general partner, fund manager, fiduciary, compliance officer, valuation agent, auditor, accountant, tax preparer or legal counsel unless a Statement of Work expressly says so. You remain responsible for investment, offering, valuation, legal and tax decisions.', 1, true),
('pricing', 'Fee schedule', 'Fees for your engagement are set in your Statement of Work and the pricing schedule agreed with Harmonious. Services outside your active scope may be requested through the platform and are quoted and signed before they begin. Third-party costs, government fees and bank charges are passed through as incurred.', 1, true),
('e_records', 'Electronic records and signatures consent', 'You agree to receive agreements, notices, statements, tax records and other documents electronically, and you agree that electronic signatures captured through this platform have the same effect as handwritten signatures. You may request a paper copy of any document from your Harmonious contact, and you may withdraw this consent for future documents by notifying Harmonious in writing.', 1, true);