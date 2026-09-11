ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS dispute_resolution TEXT,
  ADD COLUMN IF NOT EXISTS dispute_resolution_note TEXT,
  ADD COLUMN IF NOT EXISTS dispute_resolved_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS dispute_resolved_by UUID;