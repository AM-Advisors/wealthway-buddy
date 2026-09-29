ALTER TABLE public.fund_setups ADD COLUMN IF NOT EXISTS service_providers jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE public.fund_regulatory_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  filing_type text NOT NULL CHECK (filing_type IN ('form_d','blue_sky')),
  filing_kind text NOT NULL DEFAULT 'initial' CHECK (filing_kind IN ('initial','amendment','renewal')),
  state text,
  accession_number text,
  efd_id text,
  filing_date date,
  notes text,
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by uuid
);
CREATE INDEX fund_regulatory_filings_offering_idx ON public.fund_regulatory_filings(offering_id);
GRANT ALL ON public.fund_regulatory_filings TO service_role;
ALTER TABLE public.fund_regulatory_filings ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.fund_regulatory_filings IS 'Record-only log of Form D (SEC EDGAR / NASAA EFD) and Blue Sky filings made outside the platform. Never files anything.';