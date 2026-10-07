ALTER TABLE public.management_fee_terms
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_document text,
  ADD COLUMN IF NOT EXISTS side_letter_id uuid;
COMMENT ON COLUMN public.management_fee_terms.approval_status IS 'pending|approved|rejected; only approved terms enter fee calculation';
COMMENT ON COLUMN public.management_fee_terms.note IS 'Free text only; never a calculation input';