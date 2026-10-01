CREATE TABLE public.partnership_return_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.partnership_returns(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  version integer NOT NULL,
  values_cents jsonb NOT NULL DEFAULT '{}'::jsonb,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  tie_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  stage text NOT NULL DEFAULT 'draft' CHECK (stage IN ('draft','ready_for_review','reviewed','returned')),
  note text,
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (return_id, version)
);
GRANT ALL ON public.partnership_return_details TO service_role;
ALTER TABLE public.partnership_return_details ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.form_pf_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adviser_name text NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('annual','quarterly')),
  period_end date NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.form_pf_filings TO service_role;
ALTER TABLE public.form_pf_filings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.form_pf_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id uuid NOT NULL REFERENCES public.form_pf_filings(id) ON DELETE CASCADE,
  version integer NOT NULL,
  status text NOT NULL CHECK (status IN ('draft','ready_for_review','reviewed','filed_by_adviser')),
  crd_number text,
  sec_file_number text,
  adviser_size text NOT NULL DEFAULT 'smaller' CHECK (adviser_size IN ('smaller','large_hedge','large_liquidity','large_private_equity')),
  due_date date,
  offering_ids uuid[] NOT NULL DEFAULT '{}',
  sections text[] NOT NULL DEFAULT '{}',
  regulatory_aum_cents bigint,
  filed_on date,
  filing_confirmation text,
  note text,
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (filing_id, version)
);
GRANT ALL ON public.form_pf_versions TO service_role;
ALTER TABLE public.form_pf_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.irs_correspondence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('received','sent','phone_call')),
  notice_code text,
  subject text NOT NULL,
  tax_year integer,
  form_type text,
  received_on date NOT NULL,
  response_due date,
  storage_path text,
  share_with_manager boolean NOT NULL DEFAULT false,
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.irs_correspondence(offering_id);
GRANT ALL ON public.irs_correspondence TO service_role;
ALTER TABLE public.irs_correspondence ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.irs_correspondence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correspondence_id uuid NOT NULL REFERENCES public.irs_correspondence(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('open','responded','closed')),
  note text,
  storage_path text,
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.irs_correspondence_events(correspondence_id);
GRANT ALL ON public.irs_correspondence_events TO service_role;
ALTER TABLE public.irs_correspondence_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_tax_phase4_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Tax records are append-only; add a new version or entry instead.';
END $$;
REVOKE EXECUTE ON FUNCTION public.block_tax_phase4_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER partnership_return_details_append_only BEFORE UPDATE OR DELETE ON public.partnership_return_details FOR EACH ROW EXECUTE FUNCTION public.block_tax_phase4_mutation();
CREATE TRIGGER form_pf_filings_append_only BEFORE UPDATE OR DELETE ON public.form_pf_filings FOR EACH ROW EXECUTE FUNCTION public.block_tax_phase4_mutation();
CREATE TRIGGER form_pf_versions_append_only BEFORE UPDATE OR DELETE ON public.form_pf_versions FOR EACH ROW EXECUTE FUNCTION public.block_tax_phase4_mutation();
CREATE TRIGGER irs_correspondence_append_only BEFORE UPDATE OR DELETE ON public.irs_correspondence FOR EACH ROW EXECUTE FUNCTION public.block_tax_phase4_mutation();
CREATE TRIGGER irs_correspondence_events_append_only BEFORE UPDATE OR DELETE ON public.irs_correspondence_events FOR EACH ROW EXECUTE FUNCTION public.block_tax_phase4_mutation();