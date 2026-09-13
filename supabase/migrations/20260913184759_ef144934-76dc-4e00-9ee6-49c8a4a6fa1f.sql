ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS matched_wire_request_id uuid REFERENCES public.wire_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wire_matched_by uuid,
  ADD COLUMN IF NOT EXISTS wire_matched_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_matched boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS bank_transactions_matched_wire_request_idx
  ON public.bank_transactions (matched_wire_request_id);

ALTER TABLE public.wire_requests
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS settled_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settled_amount_cents bigint;
