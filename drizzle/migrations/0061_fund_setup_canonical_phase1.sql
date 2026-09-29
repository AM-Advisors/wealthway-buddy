ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS fund_signatory_person_id uuid REFERENCES public.persons(id),
  ADD COLUMN IF NOT EXISTS signatory_title text,
  ADD COLUMN IF NOT EXISTS signatory_capacity text,
  ADD COLUMN IF NOT EXISTS signatory_entity_name text,
  ADD COLUMN IF NOT EXISTS gp_entity_name text,
  ADD COLUMN IF NOT EXISTS registered_agent text,
  ADD COLUMN IF NOT EXISTS principal_address text,
  ADD COLUMN IF NOT EXISTS tax_classification text,
  ADD COLUMN IF NOT EXISTS max_offering_cents bigint,
  ADD COLUMN IF NOT EXISTS max_investment_cents bigint,
  ADD COLUMN IF NOT EXISTS offering_open_date date,
  ADD COLUMN IF NOT EXISTS offering_close_date date,
  ADD COLUMN IF NOT EXISTS rolling_closes boolean,
  ADD COLUMN IF NOT EXISTS has_multiple_classes boolean NOT NULL DEFAULT false;

ALTER TABLE public.investor_onboardings
  ADD COLUMN IF NOT EXISTS offering_class_key text;

COMMENT ON COLUMN public.fund_setups.legal_fund_name IS 'DEPRECATED: canonical legal name is offerings.legal_entity_name (history in offering_legal_name_history)';

CREATE TABLE public.offering_legal_name_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  previous_value text,
  new_value text,
  effective_date date NOT NULL DEFAULT current_date,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);
GRANT ALL ON public.offering_legal_name_history TO service_role;
ALTER TABLE public.offering_legal_name_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX offering_legal_name_history_offering_idx ON public.offering_legal_name_history(offering_id, changed_at);

CREATE OR REPLACE FUNCTION public.block_legal_name_history_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Legal name history is append-only';
END $$;
CREATE TRIGGER legal_name_history_append_only
  BEFORE UPDATE OR DELETE ON public.offering_legal_name_history
  FOR EACH ROW EXECUTE FUNCTION public.block_legal_name_history_mutation();

CREATE OR REPLACE FUNCTION public.record_offering_legal_name_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.legal_entity_name IS DISTINCT FROM OLD.legal_entity_name THEN
    INSERT INTO public.offering_legal_name_history(offering_id, previous_value, new_value, changed_by)
    VALUES (NEW.id, OLD.legal_entity_name, NEW.legal_entity_name, auth.uid());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER offerings_legal_name_history
  AFTER UPDATE OF legal_entity_name ON public.offerings
  FOR EACH ROW EXECUTE FUNCTION public.record_offering_legal_name_change();