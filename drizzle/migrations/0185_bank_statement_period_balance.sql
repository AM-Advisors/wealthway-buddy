ALTER TABLE public.bank_balance_snapshots
  ADD COLUMN IF NOT EXISTS statement_period_start date,
  ADD COLUMN IF NOT EXISTS statement_end_date date,
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
COMMENT ON COLUMN public.bank_balance_snapshots.statement_end_date IS 'Statement ending date; month-end close requires a reviewed balance whose statement ends on the period end.';