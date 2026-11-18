ALTER TABLE public.fund_close_filings ALTER COLUMN close_request_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fund_close_filings_open_fund_level
  ON public.fund_close_filings (offering_id, filing_type, jurisdiction)
  WHERE close_request_id IS NULL AND status = 'prepared';
CREATE INDEX IF NOT EXISTS fund_close_filings_offering_idx ON public.fund_close_filings (offering_id);

ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS first_sale_on date,
  ADD COLUMN IF NOT EXISTS first_sale_recorded_by uuid,
  ADD COLUMN IF NOT EXISTS first_sale_recorded_at timestamptz;

CREATE TABLE public.fund_regulatory_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('first_sale_recorded','filings_prepared','filing_recorded')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_regulatory_events TO service_role;
ALTER TABLE public.fund_regulatory_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX fund_regulatory_events_offering_idx ON public.fund_regulatory_events (offering_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.block_fund_regulatory_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Filing history is append-only';
END $$;
CREATE TRIGGER fund_regulatory_events_append_only
  BEFORE UPDATE OR DELETE ON public.fund_regulatory_events
  FOR EACH ROW EXECUTE FUNCTION public.block_fund_regulatory_event_mutation();