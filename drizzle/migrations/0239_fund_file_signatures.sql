CREATE TABLE public.fund_file_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES public.fund_files(id),
  offering_id uuid NOT NULL,
  signer_role text NOT NULL CHECK (signer_role IN ('investor','fund_manager')),
  signing_order int NOT NULL,
  signer_name text NOT NULL,
  signer_email text NOT NULL,
  signer_user_id uuid,
  onboarding_id uuid,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','sent','signed','cancelled')),
  sent_at timestamptz,
  signed_name text,
  signed_at timestamptz,
  signed_user_agent text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fund_file_signatures_file_idx ON public.fund_file_signatures(file_id);
GRANT ALL ON public.fund_file_signatures TO service_role;
ALTER TABLE public.fund_file_signatures ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.fund_file_signatures IS 'Signers for generated fund documents; accessed only via server functions. Signed rows are never edited.';