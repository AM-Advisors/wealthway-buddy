ALTER TABLE public.invoice_lines ADD COLUMN IF NOT EXISTS source_ref text;

ALTER TABLE public.invoice_lines DROP CONSTRAINT IF EXISTS invoice_lines_source_check;
ALTER TABLE public.invoice_lines ADD CONSTRAINT invoice_lines_source_check
  CHECK (source IN ('rate','expense','manual','fund_fee'));

CREATE UNIQUE INDEX IF NOT EXISTS invoice_lines_source_ref_key
  ON public.invoice_lines (source_ref) WHERE source_ref IS NOT NULL;