CREATE TABLE public.linkedin_oauth (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  refresh_expires_at timestamptz,
  scopes text,
  organizations jsonb NOT NULL DEFAULT '[]'::jsonb,
  connected_by uuid,
  connected_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.linkedin_oauth TO service_role;
ALTER TABLE public.linkedin_oauth ENABLE ROW LEVEL SECURITY;