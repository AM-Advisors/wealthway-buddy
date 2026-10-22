CREATE TABLE public.short_links (
  code text PRIMARY KEY,
  target_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.short_links TO service_role;
ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sales_policy_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_acceptance_id uuid,
  client_id uuid,
  email text NOT NULL,
  user_id uuid,
  document_id uuid NOT NULL,
  kind text NOT NULL,
  version integer NOT NULL,
  signer_name text NOT NULL,
  ip text,
  user_agent text,
  copied_to_account_at timestamptz,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, document_id)
);
CREATE INDEX sales_policy_acceptances_email_idx ON public.sales_policy_acceptances (lower(email));
GRANT ALL ON public.sales_policy_acceptances TO service_role;
ALTER TABLE public.sales_policy_acceptances ENABLE ROW LEVEL SECURITY;