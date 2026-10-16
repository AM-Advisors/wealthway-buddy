ALTER TABLE public.saas_orders
  ADD COLUMN IF NOT EXISTS kyb_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS kyb_documents jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS kyb_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS kyb_sent_to_legal_at timestamptz;