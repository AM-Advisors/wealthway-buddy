CREATE TABLE public.harmonious_series_masters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  jurisdiction text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.harmonious_series_masters TO service_role;
ALTER TABLE public.harmonious_series_masters ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.client_service_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  pricing jsonb NOT NULL DEFAULT '[]'::jsonb,
  entitlements jsonb NOT NULL DEFAULT '[]'::jsonb,
  legacy_services text[] NOT NULL DEFAULT '{}',
  mapping_review text[] NOT NULL DEFAULT '{}',
  pricing_version_id uuid,
  effective_date date NOT NULL DEFAULT current_date,
  reason text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  UNIQUE (client_id, version)
);
CREATE UNIQUE INDEX client_service_configurations_current ON public.client_service_configurations(client_id) WHERE superseded_at IS NULL;
GRANT ALL ON public.client_service_configurations TO service_role;
ALTER TABLE public.client_service_configurations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.protect_client_service_configuration()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Client service history is permanent'; END IF;
  IF OLD.superseded_at IS NOT NULL THEN RAISE EXCEPTION 'A superseded service configuration cannot change'; END IF;
  IF NEW.client_id <> OLD.client_id OR NEW.version <> OLD.version OR NEW.config <> OLD.config
     OR NEW.pricing <> OLD.pricing OR NEW.entitlements <> OLD.entitlements OR NEW.created_at <> OLD.created_at
     OR NEW.legacy_services <> OLD.legacy_services OR NEW.mapping_review <> OLD.mapping_review THEN
    RAISE EXCEPTION 'Client service configurations are append-only';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_client_service_configuration BEFORE UPDATE OR DELETE ON public.client_service_configurations
FOR EACH ROW EXECUTE FUNCTION public.protect_client_service_configuration();

ALTER TABLE public.fund_pricing_snapshots ADD COLUMN IF NOT EXISTS service_config jsonb;

CREATE OR REPLACE FUNCTION public.protect_fund_pricing_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Fund pricing snapshots are permanent'; END IF;
  IF NEW.offering_id <> OLD.offering_id OR NEW.final_total_cents <> OLD.final_total_cents
     OR NEW.baseline_total_cents <> OLD.baseline_total_cents OR NEW.created_at <> OLD.created_at
     OR NEW.source <> OLD.source OR NEW.service_config IS DISTINCT FROM OLD.service_config THEN
    RAISE EXCEPTION 'Fund pricing snapshots cannot be rewritten';
  END IF;
  IF OLD.status = 'approved' AND NEW.status <> 'approved' THEN
    RAISE EXCEPTION 'An approved pricing snapshot cannot be reopened';
  END IF;
  RETURN NEW;
END $function$;