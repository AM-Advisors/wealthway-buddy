CREATE TABLE public.account_invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_invite_links_user_idx ON public.account_invite_links(user_id);
GRANT ALL ON public.account_invite_links TO service_role;
ALTER TABLE public.account_invite_links ENABLE ROW LEVEL SECURITY;