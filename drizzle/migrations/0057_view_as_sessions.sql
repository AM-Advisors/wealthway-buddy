CREATE TABLE public.view_as_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL,
  auth_session_id text,
  perspective text NOT NULL CHECK (perspective IN ('investor','fund_manager')),
  subject_user_id uuid NOT NULL,
  offering_id uuid,
  onboarding_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 minutes'),
  ended_at timestamptz,
  end_reason text
);
GRANT ALL ON public.view_as_sessions TO service_role;
ALTER TABLE public.view_as_sessions ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX view_as_sessions_one_active ON public.view_as_sessions(staff_user_id) WHERE ended_at IS NULL;
COMMENT ON TABLE public.view_as_sessions IS 'Server-only View As perspectives. Read-only authorization simulation; never an authentication or token substitution.';