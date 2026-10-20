ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS fund_types text[];
COMMENT ON COLUMN public.document_templates.fund_types IS 'Fund types (offerings.fund_type) this template is assigned to; null = not auto-assigned.';
UPDATE public.document_templates SET fund_types = ARRAY['SPV','Single asset SPV'] WHERE fund_types IS NULL AND title ILIKE 'SPV %';