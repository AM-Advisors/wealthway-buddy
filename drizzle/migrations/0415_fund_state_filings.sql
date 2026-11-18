CREATE TABLE public.fund_state_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL,
  state text NOT NULL,
  basis text NOT NULL DEFAULT 'added' CHECK (basis IN ('formation','manager','added')),
  applies boolean NOT NULL DEFAULT true,
  not_applicable_reason text,
  filer text CHECK (filer IN ('harmonious','client_counsel')),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_id, state)
);
GRANT ALL ON public.fund_state_filings TO service_role;
ALTER TABLE public.fund_state_filings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.fund_state_filing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL,
  state text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('filed','confirmed','applicability','filer')),
  filing_year int,
  filed_on date,
  confirmation_number text,
  receipt_path text,
  note text,
  filed_event_id uuid,
  actor uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fund_state_filing_events_fund_idx ON public.fund_state_filing_events(offering_id, state);
GRANT ALL ON public.fund_state_filing_events TO service_role;
ALTER TABLE public.fund_state_filing_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.fund_state_filing_events_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'State filing history cannot be changed or deleted'; END $$;
CREATE TRIGGER fund_state_filing_events_no_change BEFORE UPDATE OR DELETE ON public.fund_state_filing_events
FOR EACH ROW EXECUTE FUNCTION public.fund_state_filing_events_immutable();

COMMENT ON TABLE public.fund_state_filings IS 'Per-fund yearly state filing applicability and filer. Record-only; nothing is filed or paid. Accessed only through access-checked server functions.';