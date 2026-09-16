-- 1. Expand the service catalogue -------------------------------------------------
ALTER TABLE public.service_catalog
  ADD COLUMN IF NOT EXISTS service_code text,
  ADD COLUMN IF NOT EXISTS standard_price_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_frequency text NOT NULL DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS applicable_entity_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS standard_scope text,
  ADD COLUMN IF NOT EXISTS standard_deliverables text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS standard_exclusions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS required_information text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contract_terms text,
  ADD COLUMN IF NOT EXISTS dependencies text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS onboarding_workflow text,
  ADD COLUMN IF NOT EXISTS delivery_workflow text,
  ADD COLUMN IF NOT EXISTS internal_owner text,
  ADD COLUMN IF NOT EXISTS renewal_rule text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

UPDATE public.service_catalog SET service_code = upper(replace(key, '-', '_')) WHERE service_code IS NULL;
UPDATE public.service_catalog SET status = CASE WHEN active THEN 'active' ELSE 'retired' END;

CREATE UNIQUE INDEX IF NOT EXISTS service_catalog_service_code_key ON public.service_catalog (service_code);

-- 2. Service packages ---------------------------------------------------------------
CREATE TABLE public.service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  applicable_entity_types text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_packages TO authenticated;
GRANT ALL ON public.service_packages TO service_role;
ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "packages readable by signed-in users" ON public.service_packages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "contract staff manage packages" ON public.service_packages
  FOR ALL TO authenticated USING (public.is_contract_staff()) WITH CHECK (public.is_contract_staff());
CREATE TRIGGER service_packages_updated_at BEFORE UPDATE ON public.service_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.service_package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.service_packages(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.service_catalog(id) ON DELETE CASCADE,
  optional boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, service_id)
);
GRANT SELECT ON public.service_package_items TO authenticated;
GRANT ALL ON public.service_package_items TO service_role;
ALTER TABLE public.service_package_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "package items readable by signed-in users" ON public.service_package_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "contract staff manage package items" ON public.service_package_items
  FOR ALL TO authenticated USING (public.is_contract_staff()) WITH CHECK (public.is_contract_staff());

-- 3. Engagements may cover several entities ------------------------------------------
CREATE TABLE public.engagement_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.client_engagements(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.client_entities(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, entity_id)
);
GRANT SELECT, INSERT, DELETE ON public.engagement_entities TO authenticated;
GRANT ALL ON public.engagement_entities TO service_role;
ALTER TABLE public.engagement_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engagement entities visible to owner or staff" ON public.engagement_entities
  FOR SELECT TO authenticated USING (
    public.is_any_staff() OR EXISTS (
      SELECT 1 FROM public.client_engagements g
      WHERE g.id = engagement_id AND public.is_client_member(g.client_id)
    )
  );
CREATE POLICY "contract staff manage engagement entities" ON public.engagement_entities
  FOR ALL TO authenticated USING (public.is_contract_staff()) WITH CHECK (public.is_contract_staff());

INSERT INTO public.engagement_entities (engagement_id, entity_id)
SELECT id, entity_id FROM public.client_engagements WHERE entity_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. Change orders --------------------------------------------------------------------
CREATE TABLE public.engagement_change_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.client_engagements(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  change_no integer NOT NULL DEFAULT 1,
  document_type text NOT NULL DEFAULT 'change_order',
  change_type text NOT NULL DEFAULT 'service_addition',
  title text NOT NULL,
  summary text,
  client_reason text,
  status text NOT NULL DEFAULT 'draft',
  effective_date date,
  requested_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  client_signed_by uuid,
  client_signer_name text,
  client_signer_title text,
  client_signed_at timestamptz,
  harmonious_signer_name text,
  harmonious_signer_title text,
  harmonious_signed_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.engagement_change_orders TO authenticated;
GRANT ALL ON public.engagement_change_orders TO service_role;
ALTER TABLE public.engagement_change_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "change orders visible to owner or staff" ON public.engagement_change_orders
  FOR SELECT TO authenticated USING (public.is_any_staff() OR public.is_client_member(client_id));
CREATE POLICY "clients request change orders" ON public.engagement_change_orders
  FOR INSERT TO authenticated WITH CHECK (public.is_client_member(client_id) OR public.is_contract_staff());
CREATE POLICY "contract staff manage change orders" ON public.engagement_change_orders
  FOR UPDATE TO authenticated USING (public.is_contract_staff() OR public.is_client_member(client_id))
  WITH CHECK (public.is_contract_staff() OR public.is_client_member(client_id));
CREATE TRIGGER engagement_change_orders_updated_at BEFORE UPDATE ON public.engagement_change_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS engagement_change_orders_engagement_idx ON public.engagement_change_orders (engagement_id);

-- 5. Engagement services with their own commercial-terms snapshot ----------------------
CREATE TABLE public.engagement_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.client_engagements(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.service_catalog(id) ON DELETE SET NULL,
  service_key text NOT NULL,
  service_name text NOT NULL,
  category text,
  standard_price_cents bigint NOT NULL DEFAULT 0,
  agreed_price_cents bigint NOT NULL DEFAULT 0,
  discount_cents bigint NOT NULL DEFAULT 0,
  discount_reason text,
  pricing_model text NOT NULL DEFAULT 'one_time',
  billing_frequency text NOT NULL DEFAULT 'one_time',
  unit text,
  pass_through boolean NOT NULL DEFAULT false,
  effective_date date,
  end_date date,
  pricing_version_id uuid REFERENCES public.pricing_versions(id) ON DELETE SET NULL,
  pricing_version_label text,
  scope text,
  deliverables text[] NOT NULL DEFAULT '{}',
  exclusions text[] NOT NULL DEFAULT '{}',
  renewal_rule text,
  status text NOT NULL DEFAULT 'proposed',
  added_by_change_order_id uuid REFERENCES public.engagement_change_orders(id) ON DELETE SET NULL,
  removed_by_change_order_id uuid REFERENCES public.engagement_change_orders(id) ON DELETE SET NULL,
  locked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.engagement_services TO authenticated;
GRANT ALL ON public.engagement_services TO service_role;
ALTER TABLE public.engagement_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engagement services visible to owner or staff" ON public.engagement_services
  FOR SELECT TO authenticated USING (public.is_any_staff() OR public.is_client_member(client_id));
CREATE POLICY "contract staff manage engagement services" ON public.engagement_services
  FOR ALL TO authenticated USING (public.is_contract_staff()) WITH CHECK (public.is_contract_staff());
CREATE TRIGGER engagement_services_updated_at BEFORE UPDATE ON public.engagement_services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS engagement_services_engagement_idx ON public.engagement_services (engagement_id);

-- executed commercial terms are immutable
CREATE OR REPLACE FUNCTION public.protect_locked_engagement_services()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    IF NEW.standard_price_cents IS DISTINCT FROM OLD.standard_price_cents
      OR NEW.agreed_price_cents IS DISTINCT FROM OLD.agreed_price_cents
      OR NEW.discount_cents IS DISTINCT FROM OLD.discount_cents
      OR NEW.pricing_model IS DISTINCT FROM OLD.pricing_model
      OR NEW.billing_frequency IS DISTINCT FROM OLD.billing_frequency
      OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
      OR NEW.pricing_version_id IS DISTINCT FROM OLD.pricing_version_id THEN
      RAISE EXCEPTION 'Executed commercial terms cannot be changed. Raise a change order instead.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER engagement_services_protect_locked BEFORE UPDATE ON public.engagement_services
  FOR EACH ROW EXECUTE FUNCTION public.protect_locked_engagement_services();

-- change order lines reference the service they add, remove or change
CREATE TABLE public.change_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id uuid NOT NULL REFERENCES public.engagement_change_orders(id) ON DELETE CASCADE,
  action text NOT NULL DEFAULT 'add',
  service_id uuid REFERENCES public.service_catalog(id) ON DELETE SET NULL,
  engagement_service_id uuid REFERENCES public.engagement_services(id) ON DELETE SET NULL,
  service_key text NOT NULL,
  service_name text NOT NULL,
  standard_price_cents bigint NOT NULL DEFAULT 0,
  agreed_price_cents bigint NOT NULL DEFAULT 0,
  discount_cents bigint NOT NULL DEFAULT 0,
  pricing_model text NOT NULL DEFAULT 'one_time',
  billing_frequency text NOT NULL DEFAULT 'one_time',
  pass_through boolean NOT NULL DEFAULT false,
  effective_date date,
  scope text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_order_lines TO authenticated;
GRANT ALL ON public.change_order_lines TO service_role;
ALTER TABLE public.change_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "change order lines visible to owner or staff" ON public.change_order_lines
  FOR SELECT TO authenticated USING (
    public.is_any_staff() OR EXISTS (
      SELECT 1 FROM public.engagement_change_orders c
      WHERE c.id = change_order_id AND public.is_client_member(c.client_id)
    )
  );
CREATE POLICY "contract staff manage change order lines" ON public.change_order_lines
  FOR ALL TO authenticated USING (public.is_contract_staff()) WITH CHECK (public.is_contract_staff());
CREATE INDEX IF NOT EXISTS change_order_lines_order_idx ON public.change_order_lines (change_order_id);

-- 6. Service delivery workflows --------------------------------------------------------
CREATE TABLE public.engagement_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.client_engagements(id) ON DELETE CASCADE,
  engagement_service_id uuid REFERENCES public.engagement_services(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES public.client_entities(id) ON DELETE SET NULL,
  workflow_key text NOT NULL,
  workflow_name text NOT NULL,
  target_path text,
  status text NOT NULL DEFAULT 'not_started',
  started_at timestamptz,
  completed_at timestamptz,
  owner_user_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, workflow_key, engagement_service_id)
);
GRANT SELECT, UPDATE ON public.engagement_workflows TO authenticated;
GRANT ALL ON public.engagement_workflows TO service_role;
ALTER TABLE public.engagement_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflows visible to owner or staff" ON public.engagement_workflows
  FOR SELECT TO authenticated USING (public.is_any_staff() OR public.is_client_member(client_id));
CREATE POLICY "contract staff manage workflows" ON public.engagement_workflows
  FOR ALL TO authenticated USING (public.is_contract_staff()) WITH CHECK (public.is_contract_staff());
CREATE TRIGGER engagement_workflows_updated_at BEFORE UPDATE ON public.engagement_workflows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Universal request router ------------------------------------------------------------
CREATE TABLE public.client_intake_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES public.client_entities(id) ON DELETE SET NULL,
  engagement_id uuid REFERENCES public.client_engagements(id) ON DELETE SET NULL,
  intent text NOT NULL,
  summary text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_service_keys text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'submitted',
  assigned_to uuid,
  staff_note text,
  resulting_engagement_id uuid REFERENCES public.client_engagements(id) ON DELETE SET NULL,
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.client_intake_requests TO authenticated;
GRANT ALL ON public.client_intake_requests TO service_role;
ALTER TABLE public.client_intake_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intake visible to owner or staff" ON public.client_intake_requests
  FOR SELECT TO authenticated USING (public.is_any_staff() OR public.is_client_member(client_id));
CREATE POLICY "clients submit intake" ON public.client_intake_requests
  FOR INSERT TO authenticated WITH CHECK (public.is_client_member(client_id) OR public.is_any_staff());
CREATE POLICY "staff update intake" ON public.client_intake_requests
  FOR UPDATE TO authenticated USING (public.is_any_staff()) WITH CHECK (public.is_any_staff());
CREATE TRIGGER client_intake_requests_updated_at BEFORE UPDATE ON public.client_intake_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS client_intake_requests_client_idx ON public.client_intake_requests (client_id, status);