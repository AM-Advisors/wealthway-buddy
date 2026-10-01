CREATE TABLE public.formation_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider_type text NOT NULL DEFAULT 'formation_and_registered_agent',
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.formation_providers TO service_role;
ALTER TABLE public.formation_providers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.formation_service_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES public.formation_providers(id) ON DELETE SET NULL,
  jurisdiction text NOT NULL,
  entity_type text,
  service_type text NOT NULL DEFAULT 'formation',
  state_fee numeric NOT NULL DEFAULT 0,
  expedite_fee numeric NOT NULL DEFAULT 0,
  provider_fee numeric NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_until date,
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verified_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.formation_service_prices TO service_role;
ALTER TABLE public.formation_service_prices ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.formation_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  service_package_key text,
  includes_registered_agent boolean NOT NULL DEFAULT true,
  includes_ein boolean NOT NULL DEFAULT false,
  includes_operating_agreement boolean NOT NULL DEFAULT false,
  includes_expedite boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.formation_bundles TO service_role;
ALTER TABLE public.formation_bundles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fund_service_orders
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.formation_providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bundle_id uuid REFERENCES public.formation_bundles(id) ON DELETE SET NULL;
ALTER TABLE public.fund_service_order_events ADD COLUMN IF NOT EXISTS manager_visible boolean NOT NULL DEFAULT false;

CREATE TABLE public.fund_formation_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  authorized_by_person_id uuid NOT NULL,
  authorized_on date NOT NULL,
  method text NOT NULL DEFAULT 'written',
  authorization_text text NOT NULL,
  registered_agent_choice text,
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.fund_formation_authorizations(offering_id);
GRANT ALL ON public.fund_formation_authorizations TO service_role;
ALTER TABLE public.fund_formation_authorizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.fund_formation_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  price_id uuid REFERENCES public.formation_service_prices(id) ON DELETE SET NULL,
  state_fees numeric NOT NULL DEFAULT 0,
  provider_cost numeric NOT NULL DEFAULT 0,
  customer_total numeric NOT NULL DEFAULT 0,
  note text,
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.fund_formation_costs(offering_id);
GRANT ALL ON public.fund_formation_costs TO service_role;
ALTER TABLE public.fund_formation_costs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.fund_formation_discrepancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  field_label text NOT NULL,
  our_value text,
  provider_value text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolution text CHECK (resolution IN ('kept_ours','accepted_provider','other')),
  resolution_note text,
  recorded_by uuid NOT NULL,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.fund_formation_discrepancies(offering_id);
GRANT ALL ON public.fund_formation_discrepancies TO service_role;
ALTER TABLE public.fund_formation_discrepancies ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_formation_record_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Formation records are append-only; add a new entry instead.';
END $$;
REVOKE EXECUTE ON FUNCTION public.block_formation_record_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER fund_formation_authorizations_append_only BEFORE UPDATE OR DELETE ON public.fund_formation_authorizations
  FOR EACH ROW EXECUTE FUNCTION public.block_formation_record_mutation();
CREATE TRIGGER fund_formation_costs_append_only BEFORE UPDATE OR DELETE ON public.fund_formation_costs
  FOR EACH ROW EXECUTE FUNCTION public.block_formation_record_mutation();

CREATE OR REPLACE FUNCTION public.guard_formation_discrepancy()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Discrepancy notes are never deleted.'; END IF;
  IF OLD.status = 'resolved' THEN RAISE EXCEPTION 'A resolved discrepancy is locked.'; END IF;
  IF NEW.field_label IS DISTINCT FROM OLD.field_label OR NEW.our_value IS DISTINCT FROM OLD.our_value
     OR NEW.provider_value IS DISTINCT FROM OLD.provider_value OR NEW.offering_id IS DISTINCT FROM OLD.offering_id
     OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by THEN
    RAISE EXCEPTION 'Only the resolution can be recorded on a discrepancy.';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_formation_discrepancy() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER fund_formation_discrepancies_guard BEFORE UPDATE OR DELETE ON public.fund_formation_discrepancies
  FOR EACH ROW EXECUTE FUNCTION public.guard_formation_discrepancy();