CREATE TABLE public.commission_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL,
  invoice_line_id uuid NOT NULL,
  user_id uuid NOT NULL,
  layer text NOT NULL,
  amount_cents bigint NOT NULL,
  payout_date date NOT NULL,
  reference text NOT NULL,
  note text,
  recorded_by uuid NOT NULL,
  reversal_of uuid REFERENCES public.commission_payouts(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.commission_payouts TO service_role;
ALTER TABLE public.commission_payouts ENABLE ROW LEVEL SECURITY;
CREATE INDEX commission_payouts_line_idx ON public.commission_payouts (invoice_line_id, user_id, layer);
CREATE UNIQUE INDEX commission_payouts_one_reversal ON public.commission_payouts (reversal_of) WHERE reversal_of IS NOT NULL;
CREATE OR REPLACE FUNCTION public.block_commission_payout_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Commission payout records cannot be changed or deleted; record a reversal instead.'; END $$;
CREATE TRIGGER commission_payouts_immutable BEFORE UPDATE OR DELETE ON public.commission_payouts FOR EACH ROW EXECUTE FUNCTION public.block_commission_payout_mutation();