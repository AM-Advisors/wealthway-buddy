ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cro';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'account_manager';
CREATE TABLE public.staff_role_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  role text NOT NULL,
  action text NOT NULL CHECK (action IN ('grant','revoke')),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.staff_role_events TO service_role;
ALTER TABLE public.staff_role_events ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_staff_role_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'staff_role_events is append-only'; END $$;
CREATE TRIGGER staff_role_events_append_only BEFORE UPDATE OR DELETE ON public.staff_role_events
FOR EACH ROW EXECUTE FUNCTION public.block_staff_role_event_mutation();