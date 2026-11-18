ALTER TABLE public.sales_custom_services
  ADD COLUMN build_stage text CHECK (build_stage IS NULL OR build_stage IN ('not_started','designing','building','testing','ready')),
  ADD COLUMN build_note text CHECK (build_note IS NULL OR length(build_note) <= 2000),
  ADD COLUMN build_updated_by uuid,
  ADD COLUMN build_updated_at timestamptz,
  ADD COLUMN list_price_cents bigint CHECK (list_price_cents IS NULL OR list_price_cents > 0),
  ADD COLUMN list_billing text CHECK (list_billing IS NULL OR list_billing IN ('one_time','monthly','quarterly','annual')),
  ADD COLUMN released_at timestamptz,
  ADD COLUMN released_by uuid,
  ADD COLUMN release_note text CHECK (release_note IS NULL OR length(release_note) <= 2000);

ALTER TABLE public.sales_custom_services ADD CONSTRAINT sales_custom_service_release_ready CHECK (
  released_at IS NULL OR (
    review_status = 'design_build' AND build_stage = 'ready' AND list_price_cents IS NOT NULL AND list_billing IS NOT NULL
    AND released_by IS NOT NULL AND released_by <> created_by
  )
);

COMMENT ON COLUMN public.sales_custom_services.list_price_cents IS 'Standard quote price set by CEO/CRO at release; quotes at or above it on the same billing need no executive approval.';

CREATE OR REPLACE FUNCTION public.sales_custom_service_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Custom services are kept on file; retire it instead'; END IF;
  IF OLD.archived_at IS NOT NULL THEN RAISE EXCEPTION 'A retired custom service can''t be changed'; END IF;
  IF NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Who created a custom service can''t be changed';
  END IF;
  IF OLD.released_at IS NOT NULL AND (
    NEW.released_at IS DISTINCT FROM OLD.released_at OR NEW.released_by IS DISTINCT FROM OLD.released_by
    OR NEW.name IS DISTINCT FROM OLD.name OR NEW.summary IS DISTINCT FROM OLD.summary
    OR NEW.included IS DISTINCT FROM OLD.included OR NEW.excluded IS DISTINCT FROM OLD.excluded
    OR NEW.review_status IS DISTINCT FROM OLD.review_status OR NEW.build_stage IS DISTINCT FROM OLD.build_stage
  ) THEN
    RAISE EXCEPTION 'A service released to quotes can''t be reworded or unreleased; retire it and add a new one';
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE public.sales_custom_service_events DROP CONSTRAINT sales_custom_service_events_event_check;
ALTER TABLE public.sales_custom_service_events ADD CONSTRAINT sales_custom_service_events_event_check
  CHECK (event IN ('created','updated','ai_drafted','reviewed','reopened','retired','build_updated','released','price_changed'));