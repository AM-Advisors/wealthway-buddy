ALTER TABLE public.investor_documents ALTER COLUMN application_id DROP NOT NULL;
ALTER TABLE public.investor_documents ADD COLUMN IF NOT EXISTS onboarding_id uuid REFERENCES public.investor_onboardings(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS investor_documents_onboarding_idx ON public.investor_documents(onboarding_id);

CREATE TABLE public.investor_fee_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL REFERENCES public.investor_onboardings(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  fee_terms_id uuid NOT NULL REFERENCES public.fund_fee_terms(id),
  terms jsonb NOT NULL,
  accepted_by uuid NOT NULL,
  accepted_name text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (onboarding_id, fee_terms_id)
);
GRANT ALL ON public.investor_fee_acceptances TO service_role;
ALTER TABLE public.investor_fee_acceptances ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_fee_acceptance_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Fee acceptances are permanent records'; END $$;
CREATE TRIGGER investor_fee_acceptances_immutable BEFORE UPDATE OR DELETE ON public.investor_fee_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.block_fee_acceptance_mutation();

CREATE TABLE public.fund_investor_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 200),
  body text NOT NULL CHECK (char_length(body) BETWEEN 2 AND 10000),
  posted_by uuid NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by uuid
);
CREATE INDEX fund_investor_updates_offering_idx ON public.fund_investor_updates(offering_id, posted_at DESC);
GRANT ALL ON public.fund_investor_updates TO service_role;
ALTER TABLE public.fund_investor_updates ENABLE ROW LEVEL SECURITY;