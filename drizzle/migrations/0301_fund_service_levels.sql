ALTER TABLE public.offerings ADD COLUMN IF NOT EXISTS service_level text NOT NULL DEFAULT 'self_serve'
  CHECK (service_level IN ('self_serve','core','plus','white_glove','institutional'));

CREATE TABLE public.fund_service_level_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  requested_level text NOT NULL CHECK (requested_level IN ('self_serve','core','plus','white_glove','institutional')),
  status text NOT NULL CHECK (status IN ('active','awaiting_payment','quote_requested','scheduled')),
  payment_id uuid,
  effective_on date,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_service_level_events TO service_role;
ALTER TABLE public.fund_service_level_events ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_service_level_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Service level history is permanent'; END $$;
CREATE TRIGGER fund_service_level_events_immutable BEFORE UPDATE OR DELETE ON public.fund_service_level_events
  FOR EACH ROW EXECUTE FUNCTION public.block_service_level_event_mutation();