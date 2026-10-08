CREATE TABLE public.investor_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL,
  position_id uuid NOT NULL,
  investor_user_id uuid,
  investment_profile_id uuid,
  bank_transaction_id uuid NOT NULL UNIQUE,
  funding_match_id uuid UNIQUE,
  expected_funding_id uuid,
  capital_call_line_id uuid,
  received_cents bigint NOT NULL CHECK (received_cents > 0),
  applied_cents bigint NOT NULL CHECK (applied_cents >= 0),
  excess_cents bigint NOT NULL CHECK (excess_cents > 0),
  balance_cents bigint NOT NULL CHECK (balance_cents >= 0 AND balance_cents <= excess_cents),
  CHECK (applied_cents + excess_cents = received_cents),
  received_on date NOT NULL,
  source_reference text,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'unapplied' CHECK (status IN ('unapplied','held_for_review','available_credit','applied_to_obligation','refund_pending','refunded','resolved','voided')),
  journal_entry_id uuid,
  created_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reviewed_by IS NULL OR reviewed_by <> created_by)
);
GRANT ALL ON public.investor_credits TO service_role;
ALTER TABLE public.investor_credits ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.investor_credit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id uuid NOT NULL REFERENCES public.investor_credits(id),
  event text NOT NULL,
  from_status text,
  to_status text,
  amount_cents bigint,
  reason text,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.investor_credit_events TO service_role;
ALTER TABLE public.investor_credit_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_investor_credit_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'investor credits are never deleted; void them'; END IF;
  IF NEW.received_cents <> OLD.received_cents OR NEW.applied_cents <> OLD.applied_cents OR NEW.excess_cents <> OLD.excess_cents
     OR NEW.bank_transaction_id <> OLD.bank_transaction_id OR NEW.position_id <> OLD.position_id OR NEW.offering_id <> OLD.offering_id
     OR NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'investor credit source facts are immutable';
  END IF;
  IF NEW.balance_cents > OLD.balance_cents THEN RAISE EXCEPTION 'investor credit balance can only decrease through dispositions'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_block_investor_credit_rewrite BEFORE UPDATE OR DELETE ON public.investor_credits FOR EACH ROW EXECUTE FUNCTION public.block_investor_credit_rewrite();

CREATE OR REPLACE FUNCTION public.block_investor_credit_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'investor credit events are append-only'; END $$;
CREATE TRIGGER trg_block_investor_credit_event_mutation BEFORE UPDATE OR DELETE ON public.investor_credit_events FOR EACH ROW EXECUTE FUNCTION public.block_investor_credit_event_mutation();
CREATE INDEX ON public.investor_credits (offering_id, position_id);