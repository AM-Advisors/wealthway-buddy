ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS wire_fee_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closing_cost_cents bigint NOT NULL DEFAULT 0;