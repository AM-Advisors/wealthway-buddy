CREATE TABLE public.user_access_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  person_id uuid,
  email text,
  state text NOT NULL CHECK (state IN ('revoked','archived')),
  scope text NOT NULL CHECK (scope IN ('global','client','offering')),
  scope_id uuid,
  reason text NOT NULL,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  lifted_at timestamptz,
  lifted_by uuid,
  CHECK (user_id IS NOT NULL OR person_id IS NOT NULL),
  CHECK ((scope = 'global') = (scope_id IS NULL))
);
CREATE INDEX user_access_states_user_idx ON public.user_access_states(user_id) WHERE lifted_at IS NULL;
CREATE INDEX user_access_states_person_idx ON public.user_access_states(person_id) WHERE lifted_at IS NULL;
GRANT ALL ON public.user_access_states TO service_role;
ALTER TABLE public.user_access_states ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind text NOT NULL,
  subject_id uuid NOT NULL,
  action text NOT NULL,
  scope text,
  scope_id uuid,
  reason text,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_access_events_subject_idx ON public.user_access_events(subject_kind, subject_id, created_at DESC);
GRANT SELECT, INSERT ON public.user_access_events TO service_role;
ALTER TABLE public.user_access_events ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_user_access_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'user_access_events is append-only'; END $$;
CREATE TRIGGER user_access_events_no_mutation BEFORE UPDATE OR DELETE ON public.user_access_events FOR EACH ROW EXECUTE FUNCTION public.block_user_access_event_mutation();

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_test_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS is_test_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS is_test_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.staff_invitations ADD COLUMN IF NOT EXISTS is_test_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.client_invitations ADD COLUMN IF NOT EXISTS is_test_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.fund_invitations ADD COLUMN IF NOT EXISTS is_test_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.client_users ADD COLUMN IF NOT EXISTS revoked_at timestamptz, ADD COLUMN IF NOT EXISTS revoked_by uuid;