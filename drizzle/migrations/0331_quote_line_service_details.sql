ALTER TABLE public.sales_quote_lines
  ADD COLUMN IF NOT EXISTS service_details jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.sales_quote_lines.service_details IS
  'Sales-recorded SOW detail for this service: { scope?: string, included?: string[], excluded?: string[] }. Display-only; does not change pricing or authority.';