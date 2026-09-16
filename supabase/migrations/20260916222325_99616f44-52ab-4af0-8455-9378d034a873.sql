
-- Master service agreements
CREATE TABLE public.msa_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  effective_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'draft',
  summary text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.msa_versions TO authenticated;
GRANT ALL ON public.msa_versions TO service_role;
ALTER TABLE public.msa_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msa versions managed" ON public.msa_versions FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));
CREATE POLICY "msa versions readable" ON public.msa_versions FOR SELECT TO authenticated USING (true);

CREATE TABLE public.msa_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  msa_version_id uuid NOT NULL REFERENCES public.msa_versions(id) ON DELETE CASCADE,
  section_no text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.msa_sections TO authenticated;
GRANT ALL ON public.msa_sections TO service_role;
ALTER TABLE public.msa_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msa sections managed" ON public.msa_sections FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));
CREATE POLICY "msa sections readable" ON public.msa_sections FOR SELECT TO authenticated USING (true);

CREATE TABLE public.client_msa_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  msa_version_id uuid NOT NULL REFERENCES public.msa_versions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'in_review',
  client_approved_at timestamptz,
  executed_at timestamptz,
  document_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, msa_version_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_msa_agreements TO authenticated;
GRANT ALL ON public.client_msa_agreements TO service_role;
ALTER TABLE public.client_msa_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client msa managed" ON public.client_msa_agreements FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));
CREATE POLICY "client msa readable" ON public.client_msa_agreements FOR SELECT TO authenticated
  USING (private.client_visible(auth.uid(), client_id));
CREATE POLICY "client msa updatable by client" ON public.client_msa_agreements FOR UPDATE TO authenticated
  USING (private.client_visible(auth.uid(), client_id)) WITH CHECK (private.client_visible(auth.uid(), client_id));

-- New fund / SPV requests
CREATE TABLE public.fund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  fund_name text NOT NULL,
  entity_type text,
  jurisdiction text,
  fund_type text,
  target_raise_cents bigint,
  expected_investors integer,
  expected_investments text,
  expected_launch_date date,
  contact_name text,
  contact_email text,
  services text[] NOT NULL DEFAULT '{}',
  notes text,
  status text NOT NULL DEFAULT 'submitted',
  sow_id uuid REFERENCES public.client_sows(id) ON DELETE SET NULL,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_requests TO authenticated;
GRANT ALL ON public.fund_requests TO service_role;
ALTER TABLE public.fund_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fund requests managed" ON public.fund_requests FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));
CREATE POLICY "fund requests readable" ON public.fund_requests FOR SELECT TO authenticated
  USING (private.client_visible(auth.uid(), client_id));
CREATE POLICY "fund requests created by client" ON public.fund_requests FOR INSERT TO authenticated
  WITH CHECK (private.client_visible(auth.uid(), client_id));

-- SOW body
CREATE TABLE public.sow_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sow_id uuid NOT NULL REFERENCES public.client_sows(id) ON DELETE CASCADE,
  section_no text NOT NULL,
  key text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sow_sections TO authenticated;
GRANT ALL ON public.sow_sections TO service_role;
ALTER TABLE public.sow_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sow sections managed" ON public.sow_sections FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));
CREATE POLICY "sow sections readable" ON public.sow_sections FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_sows s WHERE s.id = sow_id AND private.client_visible(auth.uid(), s.client_id)));

CREATE TABLE public.sow_section_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sow_id uuid NOT NULL REFERENCES public.client_sows(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.sow_sections(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'approved',
  decided_by uuid,
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sow_section_approvals TO authenticated;
GRANT ALL ON public.sow_section_approvals TO service_role;
ALTER TABLE public.sow_section_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sow approvals managed" ON public.sow_section_approvals FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));
CREATE POLICY "sow approvals readable" ON public.sow_section_approvals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_sows s WHERE s.id = sow_id AND private.client_visible(auth.uid(), s.client_id)));
CREATE POLICY "sow approvals written by client" ON public.sow_section_approvals FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.client_sows s WHERE s.id = sow_id AND private.client_visible(auth.uid(), s.client_id)));
CREATE POLICY "sow approvals updated by client" ON public.sow_section_approvals FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_sows s WHERE s.id = sow_id AND private.client_visible(auth.uid(), s.client_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.client_sows s WHERE s.id = sow_id AND private.client_visible(auth.uid(), s.client_id)));

-- Frozen pricing for a SOW
CREATE TABLE public.sow_pricing_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sow_id uuid NOT NULL REFERENCES public.client_sows(id) ON DELETE CASCADE,
  version_id uuid REFERENCES public.pricing_versions(id) ON DELETE SET NULL,
  version_label text NOT NULL,
  effective_date date,
  locked boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sow_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sow_pricing_snapshots TO authenticated;
GRANT ALL ON public.sow_pricing_snapshots TO service_role;
ALTER TABLE public.sow_pricing_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sow pricing managed" ON public.sow_pricing_snapshots FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));
CREATE POLICY "sow pricing readable" ON public.sow_pricing_snapshots FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_sows s WHERE s.id = sow_id AND private.client_visible(auth.uid(), s.client_id)));

CREATE TABLE public.sow_pricing_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.sow_pricing_snapshots(id) ON DELETE CASCADE,
  service_key text NOT NULL,
  label text NOT NULL,
  pricing_model text NOT NULL DEFAULT 'annual',
  standard_cents bigint NOT NULL DEFAULT 0,
  final_cents bigint NOT NULL DEFAULT 0,
  adjustment_reason text,
  optional boolean NOT NULL DEFAULT false,
  included boolean NOT NULL DEFAULT true,
  pass_through boolean NOT NULL DEFAULT false,
  unit text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sow_pricing_lines TO authenticated;
GRANT ALL ON public.sow_pricing_lines TO service_role;
ALTER TABLE public.sow_pricing_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sow pricing lines managed" ON public.sow_pricing_lines FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));
CREATE POLICY "sow pricing lines readable" ON public.sow_pricing_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sow_pricing_snapshots p
    JOIN public.client_sows s ON s.id = p.sow_id
    WHERE p.id = snapshot_id AND private.client_visible(auth.uid(), s.client_id)
  ));

-- Change negotiation
CREATE TABLE public.agreement_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sow_id uuid REFERENCES public.client_sows(id) ON DELETE CASCADE,
  msa_agreement_id uuid REFERENCES public.client_msa_agreements(id) ON DELETE CASCADE,
  section_key text,
  section_no text,
  section_title text NOT NULL,
  original_text text NOT NULL,
  requested_text text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'requested',
  final_text text,
  harmonious_response text,
  responded_by uuid,
  responded_at timestamptz,
  resolved_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agreement_change_requests TO authenticated;
GRANT ALL ON public.agreement_change_requests TO service_role;
ALTER TABLE public.agreement_change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "changes managed" ON public.agreement_change_requests FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));
CREATE POLICY "changes readable" ON public.agreement_change_requests FOR SELECT TO authenticated
  USING (private.client_visible(auth.uid(), client_id));
CREATE POLICY "changes raised by client" ON public.agreement_change_requests FOR INSERT TO authenticated
  WITH CHECK (private.client_visible(auth.uid(), client_id));
CREATE POLICY "changes answered by client" ON public.agreement_change_requests FOR UPDATE TO authenticated
  USING (private.client_visible(auth.uid(), client_id)) WITH CHECK (private.client_visible(auth.uid(), client_id));

CREATE TABLE public.agreement_change_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_request_id uuid NOT NULL REFERENCES public.agreement_change_requests(id) ON DELETE CASCADE,
  author_id uuid,
  author_side text NOT NULL,
  author_name text,
  body text,
  proposed_text text,
  status_after text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.agreement_change_messages TO authenticated;
GRANT ALL ON public.agreement_change_messages TO service_role;
ALTER TABLE public.agreement_change_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "change messages managed" ON public.agreement_change_messages FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));
CREATE POLICY "change messages readable" ON public.agreement_change_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agreement_change_requests c WHERE c.id = change_request_id AND private.client_visible(auth.uid(), c.client_id)));
CREATE POLICY "change messages written by client" ON public.agreement_change_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.agreement_change_requests c WHERE c.id = change_request_id AND private.client_visible(auth.uid(), c.client_id)));

-- Signatures
CREATE TABLE public.agreement_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sow_id uuid REFERENCES public.client_sows(id) ON DELETE CASCADE,
  msa_agreement_id uuid REFERENCES public.client_msa_agreements(id) ON DELETE CASCADE,
  amendment_id uuid,
  side text NOT NULL,
  company text,
  signer_name text NOT NULL,
  signer_title text,
  signer_email text,
  signer_user_id uuid,
  typed_signature text NOT NULL,
  version_label text,
  ip_address text,
  user_agent text,
  signed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.agreement_signatures TO authenticated;
GRANT ALL ON public.agreement_signatures TO service_role;
ALTER TABLE public.agreement_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signatures managed" ON public.agreement_signatures FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));
CREATE POLICY "signatures readable" ON public.agreement_signatures FOR SELECT TO authenticated
  USING (private.client_visible(auth.uid(), client_id));
CREATE POLICY "signatures written by client" ON public.agreement_signatures FOR INSERT TO authenticated
  WITH CHECK (side = 'client' AND private.client_visible(auth.uid(), client_id));

-- Immutable execution snapshots
CREATE TABLE public.agreement_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sow_id uuid REFERENCES public.client_sows(id) ON DELETE SET NULL,
  msa_agreement_id uuid REFERENCES public.client_msa_agreements(id) ON DELETE SET NULL,
  amendment_id uuid,
  snapshot jsonb NOT NULL,
  document_path text,
  executed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.agreement_executions TO authenticated;
GRANT ALL ON public.agreement_executions TO service_role;
ALTER TABLE public.agreement_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "executions managed" ON public.agreement_executions FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));
CREATE POLICY "executions readable" ON public.agreement_executions FOR SELECT TO authenticated
  USING (private.client_visible(auth.uid(), client_id));

-- Amendments to executed SOWs
CREATE TABLE public.sow_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sow_id uuid NOT NULL REFERENCES public.client_sows(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  amendment_no integer NOT NULL DEFAULT 1,
  title text NOT NULL,
  existing_terms text NOT NULL,
  requested_change text NOT NULL,
  new_terms text NOT NULL,
  effective_date date,
  status text NOT NULL DEFAULT 'draft',
  executed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sow_id, amendment_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sow_amendments TO authenticated;
GRANT ALL ON public.sow_amendments TO service_role;
ALTER TABLE public.sow_amendments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amendments managed" ON public.sow_amendments FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));
CREATE POLICY "amendments readable" ON public.sow_amendments FOR SELECT TO authenticated
  USING (private.client_visible(auth.uid(), client_id));

-- Extra state on the existing statement of work record
ALTER TABLE public.client_sows
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS msa_version_id uuid REFERENCES public.msa_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fund_request_id uuid REFERENCES public.fund_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sow_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS executed_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS special_terms text,
  ADD COLUMN IF NOT EXISTS assigned_reviewer uuid,
  ADD COLUMN IF NOT EXISTS client_final_approved_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sow_sections_sow ON public.sow_sections(sow_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_sow ON public.agreement_change_requests(sow_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_client ON public.agreement_change_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_signatures_sow ON public.agreement_signatures(sow_id);
CREATE INDEX IF NOT EXISTS idx_fund_requests_client ON public.fund_requests(client_id);

CREATE TRIGGER trg_msa_versions_updated BEFORE UPDATE ON public.msa_versions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_msa_sections_updated BEFORE UPDATE ON public.msa_sections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_client_msa_updated BEFORE UPDATE ON public.client_msa_agreements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_fund_requests_updated BEFORE UPDATE ON public.fund_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_sow_sections_updated BEFORE UPDATE ON public.sow_sections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_sow_section_approvals_updated BEFORE UPDATE ON public.sow_section_approvals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_sow_pricing_snapshots_updated BEFORE UPDATE ON public.sow_pricing_snapshots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_sow_pricing_lines_updated BEFORE UPDATE ON public.sow_pricing_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_change_requests_updated BEFORE UPDATE ON public.agreement_change_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_sow_amendments_updated BEFORE UPDATE ON public.sow_amendments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
