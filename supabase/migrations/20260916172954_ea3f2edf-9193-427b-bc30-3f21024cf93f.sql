ALTER TABLE public.ct_migrations
  ADD COLUMN IF NOT EXISTS reconciliation jsonb,
  ADD COLUMN IF NOT EXISTS overage_reason text;