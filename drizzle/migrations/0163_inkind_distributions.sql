ALTER TABLE public.distribution_batches
  ADD COLUMN IF NOT EXISTS distribution_kind text NOT NULL DEFAULT 'cash' CHECK (distribution_kind IN ('cash','cash_and_shares','shares')),
  ADD COLUMN IF NOT EXISTS cash_amount_cents bigint,
  ADD COLUMN IF NOT EXISTS share_issuer text,
  ADD COLUMN IF NOT EXISTS share_class text,
  ADD COLUMN IF NOT EXISTS share_count bigint,
  ADD COLUMN IF NOT EXISTS share_price_cents bigint,
  ADD COLUMN IF NOT EXISTS share_is_public boolean,
  ADD COLUMN IF NOT EXISTS share_custodian text,
  ADD COLUMN IF NOT EXISTS harmonious_fee_cents bigint,
  ADD COLUMN IF NOT EXISTS custodian_cost_cents bigint,
  ADD COLUMN IF NOT EXISTS fee_note text,
  ADD COLUMN IF NOT EXISTS fee_quoted_by uuid,
  ADD COLUMN IF NOT EXISTS fee_approved_by uuid,
  ADD COLUMN IF NOT EXISTS fee_approved_at timestamptz;

ALTER TABLE public.distribution_lines
  ADD COLUMN IF NOT EXISTS cash_cents bigint,
  ADD COLUMN IF NOT EXISTS shares_allocated bigint,
  ADD COLUMN IF NOT EXISTS share_value_cents bigint,
  ADD COLUMN IF NOT EXISTS share_destination text;

CREATE OR REPLACE FUNCTION public.protect_approved_distribution_line()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE parent_status TEXT;
BEGIN
  SELECT status INTO parent_status FROM public.distribution_batches WHERE id = OLD.batch_id;
  IF parent_status IN ('approved', 'executing', 'completed', 'superseded') THEN
    IF NEW.gross_cents IS DISTINCT FROM OLD.gross_cents
       OR NEW.withholding_cents IS DISTINCT FROM OLD.withholding_cents
       OR NEW.fee_cents IS DISTINCT FROM OLD.fee_cents
       OR NEW.net_cents IS DISTINCT FROM OLD.net_cents
       OR NEW.cash_cents IS DISTINCT FROM OLD.cash_cents
       OR NEW.shares_allocated IS DISTINCT FROM OLD.shares_allocated
       OR NEW.share_value_cents IS DISTINCT FROM OLD.share_value_cents
       OR NEW.investor_user_id IS DISTINCT FROM OLD.investor_user_id
       OR NEW.investment_profile_id IS DISTINCT FROM OLD.investment_profile_id
       OR NEW.position_id IS DISTINCT FROM OLD.position_id THEN
      RAISE EXCEPTION 'an approved distribution line is immutable; issue a superseding version';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE TABLE public.distribution_share_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.distribution_batches(id),
  distribution_line_id uuid NOT NULL REFERENCES public.distribution_lines(id),
  event text NOT NULL CHECK (event IN ('instructed','confirmed','failed')),
  custodian text,
  shares bigint NOT NULL,
  confirmation_ref text,
  note text,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.distribution_share_transfers TO service_role;
ALTER TABLE public.distribution_share_transfers ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.distribution_share_transfers (batch_id);

CREATE OR REPLACE FUNCTION public.block_share_transfer_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'share transfer history is append-only'; END $$;
CREATE TRIGGER distribution_share_transfers_append_only BEFORE UPDATE OR DELETE ON public.distribution_share_transfers
  FOR EACH ROW EXECUTE FUNCTION public.block_share_transfer_mutation();

CREATE TABLE public.distribution_file_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.distribution_batches(id),
  file_kind text NOT NULL,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.distribution_file_access TO service_role;
ALTER TABLE public.distribution_file_access ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER distribution_file_access_append_only BEFORE UPDATE OR DELETE ON public.distribution_file_access
  FOR EACH ROW EXECUTE FUNCTION public.block_share_transfer_mutation();