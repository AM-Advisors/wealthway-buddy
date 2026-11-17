ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'product_reviewer';

CREATE TABLE public.sales_custom_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  category text NOT NULL DEFAULT 'other' CHECK (length(category) BETWEEN 2 AND 40),
  summary text NOT NULL CHECK (length(trim(summary)) BETWEEN 10 AND 4000),
  included text[] NOT NULL DEFAULT '{}',
  excluded text[] NOT NULL DEFAULT '{}',
  billing_frequency text NOT NULL DEFAULT 'one_time' CHECK (billing_frequency IN ('one_time','monthly','quarterly','annual')),
  suggested_price_cents bigint CHECK (suggested_price_cents IS NULL OR suggested_price_cents >= 0),
  written_with text NOT NULL DEFAULT 'manual' CHECK (written_with IN ('manual','ai')),
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','design_build','add_to_product','not_tech')),
  product_target text CHECK (product_target IS NULL OR length(trim(product_target)) BETWEEN 2 AND 200),
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 2000),
  reviewed_by uuid,
  reviewed_at timestamptz,
  archived_at timestamptz,
  archived_by uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_custom_service_product_target CHECK (review_status <> 'add_to_product' OR product_target IS NOT NULL),
  CONSTRAINT sales_custom_service_reviewed CHECK (review_status = 'pending' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
GRANT ALL ON public.sales_custom_services TO service_role;
ALTER TABLE public.sales_custom_services ENABLE ROW LEVEL SECURITY;
CREATE INDEX sales_custom_services_status_idx ON public.sales_custom_services(review_status, created_at);
CREATE UNIQUE INDEX sales_custom_services_active_name ON public.sales_custom_services(lower(trim(name))) WHERE archived_at IS NULL;

CREATE FUNCTION public.sales_custom_service_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Custom services are kept on file; retire it instead'; END IF;
  IF OLD.archived_at IS NOT NULL THEN RAISE EXCEPTION 'A retired custom service can''t be changed'; END IF;
  IF NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Who created a custom service can''t be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sales_custom_service_guard BEFORE UPDATE OR DELETE ON public.sales_custom_services
  FOR EACH ROW EXECUTE FUNCTION public.sales_custom_service_guard();

CREATE TABLE public.sales_custom_service_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.sales_custom_services(id),
  actor_id uuid,
  event text NOT NULL CHECK (event IN ('created','updated','ai_drafted','reviewed','reopened','retired')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sales_custom_service_events TO service_role;
ALTER TABLE public.sales_custom_service_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX sales_custom_service_events_service_idx ON public.sales_custom_service_events(service_id, created_at);

CREATE FUNCTION public.block_custom_service_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Custom service history can''t be changed or deleted';
END $$;
CREATE TRIGGER sales_custom_service_events_append_only BEFORE UPDATE OR DELETE ON public.sales_custom_service_events
  FOR EACH ROW EXECUTE FUNCTION public.block_custom_service_event_mutation();