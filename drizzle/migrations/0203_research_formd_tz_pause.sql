CREATE TABLE public.marketing_org_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  timezone text NOT NULL DEFAULT 'America/Chicago',
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.marketing_org_settings (id, timezone) VALUES (1, 'America/Chicago');
GRANT ALL ON public.marketing_org_settings TO service_role;
ALTER TABLE public.marketing_org_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.linkedin_personal_accounts
  ADD COLUMN timezone text,
  ADD COLUMN paused_at timestamptz, ADD COLUMN paused_by uuid, ADD COLUMN pause_reason text;

ALTER TABLE public.marketing_research_stories
  ADD COLUMN category text CHECK (category IN ('breaking','regulatory','private_market','form_d','evergreen')),
  ADD COLUMN promoted boolean NOT NULL DEFAULT true;
UPDATE public.marketing_research_stories SET category = 'form_d', promoted = false WHERE source_key = 'sec_form_d';
UPDATE public.marketing_research_stories SET category = 'regulatory' WHERE category IS NULL AND source_key LIKE 'fr_%';

CREATE TABLE public.marketing_form_d_filings (
  accession text PRIMARY KEY,
  story_id uuid REFERENCES public.marketing_research_stories(id),
  cik text NOT NULL, issuer text NOT NULL, form_type text NOT NULL, is_amendment boolean NOT NULL,
  filed_at timestamptz, industry text, fund_type text, state text, exemptions text[] NOT NULL DEFAULT '{}',
  total_offering numeric, offering_indefinite boolean NOT NULL DEFAULT false, total_sold numeric,
  investors int, first_sale date, index_url text NOT NULL, doc_url text,
  newsworthy boolean NOT NULL DEFAULT false, newsworthy_reason text,
  parse_error text, fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_form_d_cik_idx ON public.marketing_form_d_filings(cik, filed_at DESC);
CREATE INDEX marketing_form_d_filed_idx ON public.marketing_form_d_filings(filed_at DESC);
GRANT ALL ON public.marketing_form_d_filings TO service_role;
ALTER TABLE public.marketing_form_d_filings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.marketing_research_sources (key,name,publisher,kind,url,credibility,is_primary,active,access_note) VALUES
('irs_newsroom','IRS Newsroom','Internal Revenue Service','manual',NULL,100,true,false,'IRS news releases have no working official RSS/API (legacy newswire feed returns 503/404). Official access is the IRS GovDelivery e-mail subscription; add stories manually. IRS Federal Register documents are already ingested automatically.')
ON CONFLICT (key) DO NOTHING;