ALTER TABLE public.fund_close_requests DROP CONSTRAINT fund_close_requests_status_check;
ALTER TABLE public.fund_close_requests ADD CONSTRAINT fund_close_requests_status_check CHECK (status = ANY (ARRAY['submitted','in_review','approved','completed','returned']));
ALTER TABLE public.fund_close_requests ADD COLUMN IF NOT EXISTS approved_by uuid, ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE TABLE public.fund_close_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  close_request_id uuid NOT NULL REFERENCES public.fund_close_requests(id) ON DELETE RESTRICT,
  offering_id uuid NOT NULL,
  filing_type text NOT NULL CHECK (filing_type IN ('form_d','blue_sky')),
  jurisdiction text NOT NULL,
  is_amendment boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','filed','not_required')),
  packet jsonb NOT NULL DEFAULT '{}'::jsonb,
  investor_count integer NOT NULL DEFAULT 0,
  amount_cents bigint NOT NULL DEFAULT 0,
  fee_cents bigint,
  fee_needs_review boolean NOT NULL DEFAULT true,
  prepared_by uuid NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  filed_by uuid,
  filed_at timestamptz,
  filed_on date,
  confirmation_number text,
  note text,
  UNIQUE (close_request_id, filing_type, jurisdiction)
);
GRANT ALL ON public.fund_close_filings TO service_role;
ALTER TABLE public.fund_close_filings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_close_filing_rewrite() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Close filings are permanent records.'; END IF;
  IF OLD.status IN ('filed','not_required') THEN RAISE EXCEPTION 'Recorded filings cannot be changed.'; END IF;
  IF NEW.packet IS DISTINCT FROM OLD.packet OR NEW.prepared_by IS DISTINCT FROM OLD.prepared_by THEN RAISE EXCEPTION 'Prepared packets cannot be rewritten.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER close_filing_guard BEFORE UPDATE OR DELETE ON public.fund_close_filings FOR EACH ROW EXECUTE FUNCTION public.block_close_filing_rewrite();