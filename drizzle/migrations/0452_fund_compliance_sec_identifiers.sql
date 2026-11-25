CREATE TABLE public.fund_sec_identifiers (
  offering_id uuid PRIMARY KEY REFERENCES public.offerings(id) ON DELETE CASCADE,
  cik text CHECK (cik IS NULL OR cik ~ '^\d{10}$'),
  ccc_last2 text,
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fund_sec_ccc_private (
  offering_id uuid PRIMARY KEY REFERENCES public.offerings(id) ON DELETE CASCADE,
  ccc text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fund_sec_identifier_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  actor uuid NOT NULL, action text NOT NULL, reason text,
  old_cik text, new_cik text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fund_compliance_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('link','file')),
  label text NOT NULL, url text, file_path text, file_name text,
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz, removed_by uuid
);
ALTER TABLE public.fund_franchise_fees ADD COLUMN IF NOT EXISTS link_url text, ADD COLUMN IF NOT EXISTS file_path text;
ALTER TABLE public.fund_regulatory_filings ADD COLUMN IF NOT EXISTS form_type text, ADD COLUMN IF NOT EXISTS edgar_url text;
GRANT ALL ON public.fund_sec_identifiers, public.fund_sec_ccc_private, public.fund_sec_identifier_events, public.fund_compliance_links TO service_role;
ALTER TABLE public.fund_sec_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_sec_ccc_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_sec_identifier_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_compliance_links ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_sec_identifier_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'History cannot be changed'; END $$;
CREATE TRIGGER sec_identifier_events_immutable BEFORE UPDATE OR DELETE ON public.fund_sec_identifier_events FOR EACH ROW EXECUTE FUNCTION public.block_sec_identifier_event_mutation();