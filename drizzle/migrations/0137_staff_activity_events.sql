CREATE TABLE public.staff_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'page' CHECK (kind IN ('page','action')),
  path text,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.staff_activity_events TO service_role;
ALTER TABLE public.staff_activity_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX staff_activity_events_user_idx ON public.staff_activity_events (user_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.block_staff_activity_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'staff_activity_events is append-only'; END $$;
CREATE TRIGGER staff_activity_events_append_only BEFORE UPDATE OR DELETE ON public.staff_activity_events
FOR EACH ROW EXECUTE FUNCTION public.block_staff_activity_mutation();