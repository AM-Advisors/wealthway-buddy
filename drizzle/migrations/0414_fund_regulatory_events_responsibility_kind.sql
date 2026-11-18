ALTER TABLE public.fund_regulatory_events DROP CONSTRAINT IF EXISTS fund_regulatory_events_kind_check;
ALTER TABLE public.fund_regulatory_events ADD CONSTRAINT fund_regulatory_events_kind_check
  CHECK (kind IN ('first_sale_recorded','filings_prepared','filing_recorded','responsibility_set'));