CREATE TABLE public.prior_signed_document_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.prior_signed_documents(id),
  onboarding_id uuid NOT NULL REFERENCES public.investor_onboardings(id),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  action text NOT NULL CHECK (action IN ('withdrawn','restored')),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  actor_user_id uuid NOT NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('harmonious','fund_manager')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.prior_signed_document_withdrawals TO service_role;
ALTER TABLE public.prior_signed_document_withdrawals ENABLE ROW LEVEL SECURITY;
CREATE INDEX prior_signed_document_withdrawals_onboarding_idx ON public.prior_signed_document_withdrawals (onboarding_id, created_at DESC);
CREATE INDEX prior_signed_document_withdrawals_document_idx ON public.prior_signed_document_withdrawals (document_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.block_prior_signed_document_withdrawal_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Undo history for loaded documents is permanent.'; END $$;
CREATE TRIGGER prior_signed_document_withdrawals_immutable BEFORE UPDATE OR DELETE ON public.prior_signed_document_withdrawals
FOR EACH ROW EXECUTE FUNCTION public.block_prior_signed_document_withdrawal_mutation();