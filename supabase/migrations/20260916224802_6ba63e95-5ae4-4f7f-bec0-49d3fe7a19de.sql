-- Client-level terms
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS default_billing_frequency text NOT NULL DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS payment_terms_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS default_discount_kind text,
  ADD COLUMN IF NOT EXISTS default_discount_value numeric,
  ADD COLUMN IF NOT EXISTS billing_contact_name text,
  ADD COLUMN IF NOT EXISTS billing_contact_email text;

CREATE TABLE IF NOT EXISTS public.client_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  entity_type text NOT NULL DEFAULT 'fund',
  legal_name text NOT NULL,
  short_name text,
  jurisdiction text,
  formation_date date,
  tax_id_status text NOT NULL DEFAULT 'not_started',
  tax_id_masked text,
  parent_entity_id uuid REFERENCES public.client_entities(id) ON DELETE SET NULL,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'planned',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_entities_type_chk CHECK (entity_type IN ('company','fund','spv','series','gp','management_company','other')),
  CONSTRAINT client_entities_status_chk CHECK (status IN ('planned','forming','active','closed')),
  CONSTRAINT client_entities_tax_chk CHECK (tax_id_status IN ('not_started','applied','issued','not_required'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_entities TO authenticated;
GRANT ALL ON public.client_entities TO service_role;
ALTER TABLE public.client_entities ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.client_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES public.client_entities(id) ON DELETE SET NULL,
  sow_id uuid REFERENCES public.client_sows(id) ON DELETE SET NULL,
  title text NOT NULL,
  billing_frequency text NOT NULL DEFAULT 'one_time',
  discount_kind text,
  discount_value numeric,
  discount_reason text,
  effective_date date,
  first_invoice_date date,
  delivery_status text NOT NULL DEFAULT 'not_started',
  service_terms text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_engagements_billing_chk CHECK (billing_frequency IN ('one_time','monthly','quarterly','annual','per_event')),
  CONSTRAINT client_engagements_discount_chk CHECK (discount_kind IS NULL OR discount_kind IN ('percent','fixed')),
  CONSTRAINT client_engagements_delivery_chk CHECK (delivery_status IN ('not_started','onboarding','live','paused','closing','closed'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_engagements TO authenticated;
GRANT ALL ON public.client_engagements TO service_role;
ALTER TABLE public.client_engagements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fund_requests ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.client_entities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS client_entities_client_idx ON public.client_entities(client_id);
CREATE INDEX IF NOT EXISTS client_entities_offering_idx ON public.client_entities(offering_id);
CREATE INDEX IF NOT EXISTS client_engagements_client_idx ON public.client_engagements(client_id);
CREATE INDEX IF NOT EXISTS client_engagements_entity_idx ON public.client_engagements(entity_id);
CREATE INDEX IF NOT EXISTS client_engagements_sow_idx ON public.client_engagements(sow_id);

CREATE OR REPLACE FUNCTION public.is_contract_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role::text IN ('admin','super_admin','legal','compliance','finance','client_success','executive')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_any_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role::text IN ('admin','super_admin','operations','legal','compliance','fund_administration','tax','finance','client_success','executive')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_client_member(_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_users
    WHERE user_id = auth.uid() AND client_id = _client_id
  )
$$;

CREATE POLICY "Staff and members read entities" ON public.client_entities
  FOR SELECT TO authenticated
  USING (public.is_any_staff() OR public.is_client_member(client_id));
CREATE POLICY "Contract staff write entities" ON public.client_entities
  FOR ALL TO authenticated
  USING (public.is_contract_staff()) WITH CHECK (public.is_contract_staff());

CREATE POLICY "Staff and members read engagements" ON public.client_engagements
  FOR SELECT TO authenticated
  USING (public.is_any_staff() OR public.is_client_member(client_id));
CREATE POLICY "Contract staff write engagements" ON public.client_engagements
  FOR ALL TO authenticated
  USING (public.is_contract_staff()) WITH CHECK (public.is_contract_staff());

CREATE TRIGGER client_entities_updated_at BEFORE UPDATE ON public.client_entities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER client_engagements_updated_at BEFORE UPDATE ON public.client_engagements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backfill: one entity per existing fund that belongs to a client
INSERT INTO public.client_entities (client_id, entity_type, legal_name, short_name, jurisdiction, formation_date, offering_id, status)
SELECT o.client_id,
       CASE WHEN COALESCE(o.entity_type,'') ILIKE '%spv%' THEN 'spv' ELSE 'fund' END,
       COALESCE(o.legal_entity_name, o.name),
       o.name,
       o.state_formed,
       o.date_formed,
       o.id,
       CASE WHEN o.is_open THEN 'active' ELSE 'closed' END
FROM public.offerings o
WHERE o.client_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.client_entities e WHERE e.offering_id = o.id);

-- Backfill: one engagement per existing statement of work
INSERT INTO public.client_engagements (client_id, entity_id, sow_id, title, effective_date, delivery_status)
SELECT s.client_id,
       e.id,
       s.id,
       s.title,
       s.effective_date,
       CASE
         WHEN s.status = 'terminated' THEN 'closed'
         WHEN s.status = 'active' THEN 'live'
         ELSE 'not_started'
       END
FROM public.client_sows s
LEFT JOIN public.client_entities e ON e.offering_id = s.offering_id
WHERE NOT EXISTS (SELECT 1 FROM public.client_engagements g WHERE g.sow_id = s.id);