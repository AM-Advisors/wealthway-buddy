ALTER TABLE public.capital_calls
  ADD COLUMN IF NOT EXISTS allocation_basis text,
  ADD COLUMN IF NOT EXISTS requested_total_cents bigint,
  ADD COLUMN IF NOT EXISTS allocation_variance_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aggregate_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS aggregate_confirmed_at timestamptz;
COMMENT ON COLUMN public.capital_calls.basis IS 'fund_total | percentage_of_commitment | fixed_amount_per_investor; legacy fixed_amount = per investor (read-only history)';
COMMENT ON COLUMN public.capital_calls.allocation_basis IS 'commitment_pro_rata | remaining_commitment_pro_rata; required for fund_total calls';