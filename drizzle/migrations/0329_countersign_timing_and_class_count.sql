ALTER TABLE public.offerings ADD COLUMN IF NOT EXISTS countersign_timing text NOT NULL DEFAULT 'pause';
ALTER TABLE public.offerings ADD CONSTRAINT offerings_countersign_timing_check CHECK (countersign_timing IN ('pause','parallel','after_completion'));
ALTER TABLE public.offerings ADD COLUMN IF NOT EXISTS planned_class_count integer;
ALTER TABLE public.offerings ADD CONSTRAINT offerings_planned_class_count_check CHECK (planned_class_count IS NULL OR (planned_class_count BETWEEN 1 AND 20));

CREATE TABLE public.offering_countersign_timing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  previous_value text,
  new_value text NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.offering_countersign_timing_events TO service_role;
ALTER TABLE public.offering_countersign_timing_events ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_countersign_timing_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Countersign timing history cannot be changed'; END $$;
CREATE TRIGGER countersign_timing_events_immutable BEFORE UPDATE OR DELETE ON public.offering_countersign_timing_events
FOR EACH ROW EXECUTE FUNCTION public.block_countersign_timing_event_mutation();