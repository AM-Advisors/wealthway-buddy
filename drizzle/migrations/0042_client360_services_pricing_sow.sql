
CREATE TABLE public.service_groups (
  key text PRIMARY KEY,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_groups TO authenticated;
GRANT ALL ON public.service_groups TO service_role;
ALTER TABLE public.service_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read service groups" ON public.service_groups FOR SELECT TO authenticated USING (public.is_any_staff());

INSERT INTO public.service_groups(key,label,sort_order) VALUES
 ('fund_entity','Fund & Entity',10),('investor_operations','Investor Operations',20),
 ('accounting_reporting','Accounting & Reporting',30),('tax','Tax',40),
 ('regulatory_compliance','Regulatory & Compliance',50),('capital_banking','Capital & Banking',60),
 ('ownership_company','Ownership & Company',70),('custom','Custom / Other',80);

ALTER TABLE public.service_catalog ADD COLUMN service_group text REFERENCES public.service_groups(key);
UPDATE public.service_catalog SET service_group = CASE
  WHEN key IN ('tax_doc_collection') THEN 'tax'
  WHEN key IN ('capital_calls','distributions','in_kind_distributions','capital_accounts') THEN 'capital_banking'
  WHEN category IN ('administration','entity_services') THEN 'fund_entity'
  WHEN category = 'investor_services' THEN 'investor_operations'
  WHEN category = 'accounting' THEN 'accounting_reporting'
  WHEN category = 'tax' THEN 'tax'
  WHEN category IN ('regulatory','compliance') THEN 'regulatory_compliance'
  WHEN category IN ('banking','transactions') THEN 'capital_banking'
  WHEN category = 'cap_table' THEN 'ownership_company'
  ELSE 'custom' END
WHERE service_group IS NULL;

CREATE TABLE public.sow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  engagement_type text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  effective_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  approved_by uuid,
  approved_at timestamptz,
  retired_at timestamptz,
  source_document_path text,
  body text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_type, version),
  CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
GRANT SELECT ON public.sow_templates TO authenticated;
GRANT ALL ON public.sow_templates TO service_role;
ALTER TABLE public.sow_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read SOW templates" ON public.sow_templates FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE OR REPLACE FUNCTION public.protect_sow_template() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF OLD.status = 'retired' THEN RAISE EXCEPTION 'A retired SOW template cannot be changed.'; END IF;
  IF OLD.status = 'approved' THEN
    IF NEW.status = 'draft' THEN RAISE EXCEPTION 'An approved SOW template cannot return to draft.'; END IF;
    IF NEW.body IS DISTINCT FROM OLD.body OR NEW.version <> OLD.version OR NEW.engagement_type <> OLD.engagement_type
       OR NEW.effective_date <> OLD.effective_date THEN
      RAISE EXCEPTION 'An approved SOW template is locked; release a new version instead.';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER sow_templates_protect BEFORE UPDATE ON public.sow_templates FOR EACH ROW EXECUTE FUNCTION public.protect_sow_template();
CREATE OR REPLACE FUNCTION public.block_sow_template_delete() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'Only draft SOW templates can be deleted.'; END IF; RETURN OLD; END $$;
CREATE TRIGGER sow_templates_no_delete BEFORE DELETE ON public.sow_templates FOR EACH ROW EXECUTE FUNCTION public.block_sow_template_delete();

ALTER TABLE public.client_sows
  ADD COLUMN template_id uuid REFERENCES public.sow_templates(id),
  ADD COLUMN template_version integer,
  ADD COLUMN generated_automatically boolean NOT NULL DEFAULT false,
  ADD COLUMN template_override_reason text,
  ADD COLUMN template_override_by uuid,
  ADD COLUMN template_override_at timestamptz,
  ADD COLUMN generated_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN review_blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN amends_sow_id uuid REFERENCES public.client_sows(id);

ALTER TABLE public.client_contacts
  ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  ADD COLUMN user_id uuid,
  ADD COLUMN deactivated_at timestamptz,
  ADD COLUMN deactivated_by uuid;

CREATE TABLE public.client_contact_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.client_contacts(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  role text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((offering_id IS NULL) <> (company_id IS NULL))
);
CREATE UNIQUE INDEX client_contact_scopes_uniq ON public.client_contact_scopes(contact_id, coalesce(offering_id, company_id), role);
GRANT SELECT ON public.client_contact_scopes TO authenticated;
GRANT ALL ON public.client_contact_scopes TO service_role;
ALTER TABLE public.client_contact_scopes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read contact scopes" ON public.client_contact_scopes FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE TABLE public.client_service_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  offering_id uuid REFERENCES public.offerings(id),
  service_key text NOT NULL,
  service_id uuid REFERENCES public.service_catalog(id),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','contracted','active','paused','terminated','removed')),
  pending_change text CHECK (pending_change IN ('add','remove')),
  custom_price_cents bigint,
  override_original_cents bigint,
  override_reason text,
  override_by uuid,
  override_at timestamptz,
  override_status text CHECK (override_status IN ('pending_approval','approved','rejected')),
  override_approved_by uuid,
  override_approved_at timestamptz,
  sow_id uuid REFERENCES public.client_sows(id),
  contracted_sow_id uuid REFERENCES public.client_sows(id),
  contracted_at timestamptz,
  contracted_snapshot jsonb,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (override_approved_by IS NULL OR override_approved_by <> override_by)
);
CREATE UNIQUE INDEX client_service_selections_live ON public.client_service_selections
  (client_id, coalesce(offering_id, '00000000-0000-0000-0000-000000000000'::uuid), service_key)
  WHERE status NOT IN ('removed','terminated');
GRANT SELECT ON public.client_service_selections TO authenticated;
GRANT ALL ON public.client_service_selections TO service_role;
ALTER TABLE public.client_service_selections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read service selections" ON public.client_service_selections FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE OR REPLACE FUNCTION public.protect_service_selection() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.status = 'contracted' AND OLD.status <> 'contracted' THEN
    IF NEW.contracted_sow_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.client_sows s WHERE s.id = NEW.contracted_sow_id AND s.executed_at IS NOT NULL) THEN
      RAISE EXCEPTION 'A service becomes Contracted only through a fully executed SOW.';
    END IF;
  END IF;
  IF OLD.contracted_snapshot IS NOT NULL AND NEW.contracted_snapshot IS DISTINCT FROM OLD.contracted_snapshot THEN
    RAISE EXCEPTION 'The executed service snapshot cannot be changed.';
  END IF;
  IF OLD.contracted_sow_id IS NOT NULL AND NEW.contracted_sow_id IS DISTINCT FROM OLD.contracted_sow_id THEN
    RAISE EXCEPTION 'The executed SOW reference cannot be changed.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER client_service_selections_protect BEFORE UPDATE ON public.client_service_selections FOR EACH ROW EXECUTE FUNCTION public.protect_service_selection();

CREATE OR REPLACE FUNCTION public.contract_services_on_sow_execution() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE line jsonb;
BEGIN
  IF NEW.executed_at IS NOT NULL AND OLD.executed_at IS NULL THEN
    FOR line IN SELECT * FROM jsonb_array_elements(coalesce(NEW.generated_lines,'[]'::jsonb)) LOOP
      IF line->>'selectionId' IS NOT NULL THEN
        IF coalesce(line->>'change','add') = 'remove' THEN
          UPDATE public.client_service_selections SET status='terminated', pending_change=NULL
            WHERE id = (line->>'selectionId')::uuid;
        ELSE
          UPDATE public.client_service_selections
            SET status='contracted', pending_change=NULL, contracted_sow_id=NEW.id,
                contracted_at=NEW.executed_at, contracted_snapshot=line
            WHERE id = (line->>'selectionId')::uuid AND status='proposed' AND contracted_snapshot IS NULL;
        END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_sows_contract_services AFTER UPDATE OF executed_at ON public.client_sows FOR EACH ROW EXECUTE FUNCTION public.contract_services_on_sow_execution();

CREATE OR REPLACE FUNCTION public.protect_executed_sow_lines() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF OLD.executed_at IS NOT NULL AND (NEW.generated_lines IS DISTINCT FROM OLD.generated_lines
     OR NEW.template_id IS DISTINCT FROM OLD.template_id OR NEW.template_version IS DISTINCT FROM OLD.template_version) THEN
    RAISE EXCEPTION 'An executed SOW cannot be changed; use an amendment.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_sows_protect_lines BEFORE UPDATE ON public.client_sows FOR EACH ROW EXECUTE FUNCTION public.protect_executed_sow_lines();

CREATE TABLE public.fund_client_reassignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  from_client_id uuid REFERENCES public.clients(id),
  to_client_id uuid NOT NULL REFERENCES public.clients(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  CHECK (reviewed_by IS NULL OR reviewed_by <> requested_by)
);
CREATE UNIQUE INDEX fund_client_reassignments_one_pending ON public.fund_client_reassignments(offering_id) WHERE status='pending';
GRANT SELECT ON public.fund_client_reassignments TO authenticated;
GRANT ALL ON public.fund_client_reassignments TO service_role;
ALTER TABLE public.fund_client_reassignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read reassignments" ON public.fund_client_reassignments FOR SELECT TO authenticated USING (public.is_any_staff());
