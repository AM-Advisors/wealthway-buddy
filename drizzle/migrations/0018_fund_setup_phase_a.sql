-- Fund Administration Phase A: fund setup, configuration and launch.

CREATE TABLE public.fund_setups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL UNIQUE REFERENCES public.offerings(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  fund_request_id UUID REFERENCES public.fund_requests(id) ON DELETE SET NULL,
  structure TEXT NOT NULL DEFAULT 'spv',
  structure_other TEXT,
  legal_fund_name TEXT,
  display_name TEXT,
  domicile TEXT,
  entity_type TEXT,
  formation_date DATE,
  fiscal_year_end TEXT,
  tax_year TEXT,
  base_currency TEXT NOT NULL DEFAULT 'USD',
  regulatory_structure TEXT,
  investment_strategy TEXT,
  target_size_cents BIGINT,
  hard_cap_cents BIGINT,
  min_investment_cents BIGINT,
  target_close DATE,
  final_close DATE,
  investment_period_months INTEGER,
  fund_term_months INTEGER,
  extension_terms TEXT,
  series_parent_id UUID REFERENCES public.fund_setups(id) ON DELETE SET NULL,
  series_designation TEXT,
  stage TEXT NOT NULL DEFAULT 'new_request',
  launch_state TEXT NOT NULL DEFAULT 'not_ready',
  launch_approved_by UUID,
  launch_approved_at TIMESTAMPTZ,
  launched_at TIMESTAMPTZ,
  investor_onboarding_url TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.fund_setup_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id UUID NOT NULL REFERENCES public.fund_setups(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  organization_id UUID,
  person_id UUID,
  entity_id UUID,
  user_id UUID,
  display_name TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  is_authorized_signatory BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX fund_setup_parties_setup_idx ON public.fund_setup_parties(setup_id, role);

CREATE TABLE public.fund_setup_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id UUID NOT NULL REFERENCES public.fund_setups(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  task_key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  responsible_party TEXT NOT NULL DEFAULT 'harmonious',
  assigned_user_id UUID,
  client_owner_user_id UUID,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'not_started',
  dependencies TEXT[] NOT NULL DEFAULT '{}',
  blocking BOOLEAN NOT NULL DEFAULT true,
  client_editable BOOLEAN NOT NULL DEFAULT false,
  response JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed_by UUID,
  completed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (setup_id, task_key)
);
CREATE INDEX fund_setup_tasks_status_idx ON public.fund_setup_tasks(setup_id, section, status);

CREATE TABLE public.fund_setup_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id UUID NOT NULL REFERENCES public.fund_setups(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.fund_setup_tasks(id) ON DELETE SET NULL,
  doc_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'template',
  version INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT true,
  supersedes_id UUID REFERENCES public.fund_setup_documents(id) ON DELETE SET NULL,
  storage_path TEXT,
  external_reference TEXT,
  uploaded_by UUID,
  uploaded_role TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  investor_facing BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (setup_id, doc_type, version)
);
CREATE INDEX fund_setup_documents_current_idx ON public.fund_setup_documents(setup_id, doc_type, is_current);

CREATE TABLE public.fund_entity_formation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id UUID NOT NULL UNIQUE REFERENCES public.fund_setups(id) ON DELETE CASCADE,
  step TEXT NOT NULL DEFAULT 'name_selected',
  jurisdiction TEXT,
  registered_agent TEXT,
  registered_agent_confirmed_at TIMESTAMPTZ,
  entity_identifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  formation_requested_at TIMESTAMPTZ,
  formation_filed_at TIMESTAMPTZ,
  formation_accepted_at TIMESTAMPTZ,
  ein_requested_at TIMESTAMPTZ,
  ein_received_at TIMESTAMPTZ,
  entity_active_at TIMESTAMPTZ,
  formation_document_id UUID REFERENCES public.fund_setup_documents(id) ON DELETE SET NULL,
  certificate_document_id UUID REFERENCES public.fund_setup_documents(id) ON DELETE SET NULL,
  ein_letter_document_id UUID REFERENCES public.fund_setup_documents(id) ON DELETE SET NULL,
  notes TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.fund_economics_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id UUID NOT NULL REFERENCES public.fund_setups(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  classes JSONB NOT NULL DEFAULT '[]'::jsonb,
  investor_specific JSONB NOT NULL DEFAULT '[]'::jsonb,
  effective_from DATE,
  supersedes_id UUID REFERENCES public.fund_economics_versions(id) ON DELETE SET NULL,
  change_reason TEXT,
  prepared_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (setup_id, version)
);

CREATE TABLE public.fund_target_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id UUID NOT NULL REFERENCES public.fund_setups(id) ON DELETE CASCADE,
  asset_name TEXT NOT NULL,
  issuer_name TEXT,
  security_type TEXT,
  round_name TEXT,
  price_per_unit_cents BIGINT,
  valuation_cents BIGINT,
  purchase_amount_cents BIGINT,
  unit_count NUMERIC(24,6),
  closing_date DATE,
  investment_terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  issuer_approval_status TEXT NOT NULL DEFAULT 'not_required',
  transfer_restrictions TEXT,
  purchase_agreement_document_id UUID REFERENCES public.fund_setup_documents(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.fund_banking_setups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id UUID NOT NULL UNIQUE REFERENCES public.fund_setups(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started',
  bank_name TEXT,
  relationship_contact TEXT,
  application_submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  account_active_at TIMESTAMPTZ,
  account_reference TEXT,
  investor_instructions_released BOOLEAN NOT NULL DEFAULT false,
  investor_instructions_released_by UUID,
  investor_instructions_released_at TIMESTAMPTZ,
  notes TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.fund_regulatory_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id UUID NOT NULL REFERENCES public.fund_setups(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  selections JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  amendment_reason TEXT,
  supersedes_id UUID REFERENCES public.fund_regulatory_configs(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (setup_id, version)
);

CREATE TABLE public.fund_eligibility_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id UUID NOT NULL REFERENCES public.fund_setups(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  supersedes_id UUID REFERENCES public.fund_eligibility_configs(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (setup_id, version)
);

CREATE TABLE public.fund_onboarding_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id UUID NOT NULL REFERENCES public.fund_setups(id) ON DELETE CASCADE,
  investor_type TEXT NOT NULL DEFAULT 'all',
  step TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (setup_id, investor_type, step)
);

CREATE TABLE public.fund_launch_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id UUID NOT NULL REFERENCES public.fund_setups(id) ON DELETE CASCADE,
  condition_key TEXT NOT NULL,
  label TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT true,
  satisfied BOOLEAN NOT NULL DEFAULT false,
  satisfied_at TIMESTAMPTZ,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (setup_id, condition_key)
);

CREATE TABLE public.fund_launch_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id UUID NOT NULL REFERENCES public.fund_setups(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,
  reason TEXT,
  unmet_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  decided_by UUID NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.fund_setup_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id UUID REFERENCES public.fund_setups(id) ON DELETE CASCADE,
  subject_table TEXT NOT NULL,
  subject_id UUID,
  event TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id UUID,
  actor_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX fund_setup_events_setup_idx ON public.fund_setup_events(setup_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_setups TO authenticated;
GRANT ALL ON public.fund_setups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_setup_parties TO authenticated;
GRANT ALL ON public.fund_setup_parties TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_setup_tasks TO authenticated;
GRANT ALL ON public.fund_setup_tasks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_setup_documents TO authenticated;
GRANT ALL ON public.fund_setup_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_entity_formation TO authenticated;
GRANT ALL ON public.fund_entity_formation TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_economics_versions TO authenticated;
GRANT ALL ON public.fund_economics_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_target_assets TO authenticated;
GRANT ALL ON public.fund_target_assets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_banking_setups TO authenticated;
GRANT ALL ON public.fund_banking_setups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_regulatory_configs TO authenticated;
GRANT ALL ON public.fund_regulatory_configs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_eligibility_configs TO authenticated;
GRANT ALL ON public.fund_eligibility_configs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_onboarding_requirements TO authenticated;
GRANT ALL ON public.fund_onboarding_requirements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_launch_conditions TO authenticated;
GRANT ALL ON public.fund_launch_conditions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_launch_approvals TO authenticated;
GRANT ALL ON public.fund_launch_approvals TO service_role;
GRANT SELECT, INSERT ON public.fund_setup_events TO authenticated;
GRANT ALL ON public.fund_setup_events TO service_role;

ALTER TABLE public.fund_setups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_setup_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_setup_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_setup_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_entity_formation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_economics_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_target_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_banking_setups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_regulatory_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_eligibility_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_onboarding_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_launch_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_launch_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_setup_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.fund_setup_manager(_setup_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.fund_setups s
    JOIN public.fund_managers m ON m.offering_id = s.offering_id
    WHERE s.id = _setup_id AND m.user_id = auth.uid()
  )
$$;

CREATE POLICY "staff manage fund setups" ON public.fund_setups
  FOR ALL TO authenticated USING (public.is_any_staff()) WITH CHECK (public.is_any_staff());
CREATE POLICY "managers read own fund setup" ON public.fund_setups
  FOR SELECT TO authenticated USING (private.manages_offering(offering_id));

CREATE POLICY "staff manage setup parties" ON public.fund_setup_parties
  FOR ALL TO authenticated USING (public.is_any_staff()) WITH CHECK (public.is_any_staff());
CREATE POLICY "managers read setup parties" ON public.fund_setup_parties
  FOR SELECT TO authenticated USING (public.fund_setup_manager(setup_id));

CREATE POLICY "staff manage setup tasks" ON public.fund_setup_tasks
  FOR ALL TO authenticated USING (public.is_any_staff()) WITH CHECK (public.is_any_staff());
CREATE POLICY "managers read setup tasks" ON public.fund_setup_tasks
  FOR SELECT TO authenticated USING (public.fund_setup_manager(setup_id));

CREATE POLICY "staff manage setup documents" ON public.fund_setup_documents
  FOR ALL TO authenticated USING (public.is_any_staff()) WITH CHECK (public.is_any_staff());
CREATE POLICY "managers read setup documents" ON public.fund_setup_documents
  FOR SELECT TO authenticated USING (public.fund_setup_manager(setup_id));

CREATE POLICY "staff manage entity formation" ON public.fund_entity_formation
  FOR ALL TO authenticated USING (public.is_any_staff()) WITH CHECK (public.is_any_staff());
CREATE POLICY "managers read entity formation" ON public.fund_entity_formation
  FOR SELECT TO authenticated USING (public.fund_setup_manager(setup_id));

CREATE POLICY "staff manage economics" ON public.fund_economics_versions
  FOR ALL TO authenticated USING (public.is_any_staff()) WITH CHECK (public.is_any_staff());
CREATE POLICY "managers read economics" ON public.fund_economics_versions
  FOR SELECT TO authenticated USING (public.fund_setup_manager(setup_id));

CREATE POLICY "staff manage target assets" ON public.fund_target_assets
  FOR ALL TO authenticated USING (public.is_any_staff()) WITH CHECK (public.is_any_staff());
CREATE POLICY "managers read target assets" ON public.fund_target_assets
  FOR SELECT TO authenticated USING (public.fund_setup_manager(setup_id));

CREATE POLICY "staff manage banking setup" ON public.fund_banking_setups
  FOR ALL TO authenticated USING (public.is_any_staff()) WITH CHECK (public.is_any_staff());

CREATE POLICY "staff manage regulatory config" ON public.fund_regulatory_configs
  FOR ALL TO authenticated USING (public.is_any_staff()) WITH CHECK (public.is_any_staff());
CREATE POLICY "managers read regulatory config" ON public.fund_regulatory_configs
  FOR SELECT TO authenticated USING (public.fund_setup_manager(setup_id));

CREATE POLICY "staff manage eligibility config" ON public.fund_eligibility_configs
  FOR ALL TO authenticated USING (public.is_any_staff()) WITH CHECK (public.is_any_staff());
CREATE POLICY "managers read eligibility config" ON public.fund_eligibility_configs
  FOR SELECT TO authenticated USING (public.fund_setup_manager(setup_id));

CREATE POLICY "staff manage onboarding requirements" ON public.fund_onboarding_requirements
  FOR ALL TO authenticated USING (public.is_any_staff()) WITH CHECK (public.is_any_staff());
CREATE POLICY "managers read onboarding requirements" ON public.fund_onboarding_requirements
  FOR SELECT TO authenticated USING (public.fund_setup_manager(setup_id));

CREATE POLICY "staff manage launch conditions" ON public.fund_launch_conditions
  FOR ALL TO authenticated USING (public.is_any_staff()) WITH CHECK (public.is_any_staff());
CREATE POLICY "managers read launch conditions" ON public.fund_launch_conditions
  FOR SELECT TO authenticated USING (public.fund_setup_manager(setup_id));

CREATE POLICY "staff read launch approvals" ON public.fund_launch_approvals
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "staff record launch approvals" ON public.fund_launch_approvals
  FOR INSERT TO authenticated WITH CHECK (public.is_any_staff() AND decided_by = auth.uid());

CREATE POLICY "staff read setup events" ON public.fund_setup_events
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "managers read setup events" ON public.fund_setup_events
  FOR SELECT TO authenticated USING (public.fund_setup_manager(setup_id));

CREATE OR REPLACE FUNCTION public.protect_fund_setup_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'fund setup events are append-only';
END;
$$;

CREATE TRIGGER fund_setup_events_append_only
  BEFORE UPDATE OR DELETE ON public.fund_setup_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_fund_setup_events();

CREATE OR REPLACE FUNCTION public.protect_fund_launch_approvals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'launch approvals cannot be altered once recorded';
END;
$$;

CREATE TRIGGER fund_launch_approvals_immutable
  BEFORE UPDATE OR DELETE ON public.fund_launch_approvals
  FOR EACH ROW EXECUTE FUNCTION public.protect_fund_launch_approvals();

CREATE OR REPLACE FUNCTION public.protect_fund_setup_document_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_current = false THEN
      RAISE EXCEPTION 'a superseded document version cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.is_current = false THEN
    IF NEW.storage_path IS DISTINCT FROM OLD.storage_path
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.doc_type IS DISTINCT FROM OLD.doc_type
       OR NEW.is_current IS DISTINCT FROM OLD.is_current THEN
      RAISE EXCEPTION 'a superseded document version is preserved and cannot be rewritten';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fund_setup_documents_history
  BEFORE UPDATE OR DELETE ON public.fund_setup_documents
  FOR EACH ROW EXECUTE FUNCTION public.protect_fund_setup_document_history();

CREATE OR REPLACE FUNCTION public.protect_fund_economics_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('approved', 'superseded') THEN
      RAISE EXCEPTION 'approved economics versions are preserved';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('approved', 'superseded') THEN
    IF NEW.terms::text IS DISTINCT FROM OLD.terms::text
       OR NEW.classes::text IS DISTINCT FROM OLD.classes::text
       OR NEW.investor_specific::text IS DISTINCT FROM OLD.investor_specific::text
       OR NEW.version IS DISTINCT FROM OLD.version THEN
      RAISE EXCEPTION 'approved economics cannot be edited; create a new version';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fund_economics_versions_history
  BEFORE UPDATE OR DELETE ON public.fund_economics_versions
  FOR EACH ROW EXECUTE FUNCTION public.protect_fund_economics_history();

CREATE OR REPLACE FUNCTION public.protect_fund_regulatory_config()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'a locked regulatory configuration is preserved';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.locked_at IS NOT NULL AND NEW.selections::text IS DISTINCT FROM OLD.selections::text THEN
    RAISE EXCEPTION 'a locked regulatory configuration is amended with a new version';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fund_regulatory_configs_lock
  BEFORE UPDATE OR DELETE ON public.fund_regulatory_configs
  FOR EACH ROW EXECUTE FUNCTION public.protect_fund_regulatory_config();

CREATE TRIGGER fund_setups_updated_at BEFORE UPDATE ON public.fund_setups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER fund_setup_tasks_updated_at BEFORE UPDATE ON public.fund_setup_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER fund_setup_documents_updated_at BEFORE UPDATE ON public.fund_setup_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();