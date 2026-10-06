CREATE TABLE public.prior_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL REFERENCES public.investor_onboardings(id),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  version integer NOT NULL DEFAULT 1,
  commitment_cents bigint NOT NULL CHECK (commitment_cents > 0),
  funded_cents bigint NOT NULL CHECK (funded_cents >= 0),
  signed_on date NOT NULL,
  evidence_item_ids uuid[] NOT NULL DEFAULT '{}',
  reason text,
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (onboarding_id, version)
);
CREATE TABLE public.prior_subscription_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prior_subscription_id uuid NOT NULL UNIQUE REFERENCES public.prior_subscriptions(id),
  decision text NOT NULL CHECK (decision IN ('confirmed','rejected')),
  decided_by uuid NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.prior_subscriptions TO service_role;
GRANT ALL ON public.prior_subscription_decisions TO service_role;
ALTER TABLE public.prior_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prior_subscription_decisions ENABLE ROW LEVEL SECURITY;
CREATE INDEX prior_subscriptions_offering_idx ON public.prior_subscriptions(offering_id);

CREATE OR REPLACE FUNCTION public.block_prior_subscription_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Prior subscription records are append-only'; END $$;
CREATE TRIGGER prior_subscriptions_append_only BEFORE UPDATE OR DELETE ON public.prior_subscriptions FOR EACH ROW EXECUTE FUNCTION public.block_prior_subscription_mutation();
CREATE TRIGGER prior_subscription_decisions_append_only BEFORE UPDATE OR DELETE ON public.prior_subscription_decisions FOR EACH ROW EXECUTE FUNCTION public.block_prior_subscription_mutation();

CREATE OR REPLACE FUNCTION public.prior_subscription_checker() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.decision = 'confirmed' AND EXISTS (SELECT 1 FROM public.prior_subscriptions p WHERE p.id = NEW.prior_subscription_id AND p.recorded_by = NEW.decided_by) THEN
    RAISE EXCEPTION 'The person who recorded a prior subscription cannot confirm it';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER prior_subscription_decisions_checker BEFORE INSERT ON public.prior_subscription_decisions FOR EACH ROW EXECUTE FUNCTION public.prior_subscription_checker();