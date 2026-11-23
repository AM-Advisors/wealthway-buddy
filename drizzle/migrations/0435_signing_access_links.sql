CREATE TABLE public.signing_access_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  onboarding_id uuid NOT NULL,
  offering_id uuid NOT NULL,
  offering_document_id uuid NOT NULL,
  signer_email text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  used_at timestamptz,
  opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.signing_access_links TO service_role;
ALTER TABLE public.signing_access_links ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX signing_access_links_one_active ON public.signing_access_links (onboarding_id, offering_document_id) WHERE revoked_at IS NULL AND used_at IS NULL;