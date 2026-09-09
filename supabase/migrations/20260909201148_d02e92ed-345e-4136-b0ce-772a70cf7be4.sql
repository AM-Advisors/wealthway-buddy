ALTER TABLE public.investor_applications
  ADD COLUMN IF NOT EXISTS wire_fee_cents integer,
  ADD COLUMN IF NOT EXISTS wire_fee_note text;

COMMENT ON COLUMN public.investor_applications.wire_fee_cents IS 'Per-investor wire fee override in cents. NULL means use the fund-wide fee.';