CREATE TABLE public.security_session_revocations (
  user_id uuid PRIMARY KEY,
  revoked_after timestamptz NOT NULL,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.security_session_revocations TO service_role;
ALTER TABLE public.security_session_revocations ENABLE ROW LEVEL SECURITY;