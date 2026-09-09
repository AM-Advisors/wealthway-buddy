ALTER TABLE public.investor_cap_positions
  ADD COLUMN IF NOT EXISTS notified_ownership_pct numeric,
  ADD COLUMN IF NOT EXISTS notified_committed_cents bigint,
  ADD COLUMN IF NOT EXISTS notified_received_cents bigint,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;