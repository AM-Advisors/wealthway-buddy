CREATE TABLE public.marketing_research_sources (
  key text PRIMARY KEY,
  name text NOT NULL,
  publisher text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('rss','atom','federal_register','licensed','manual')),
  url text,
  credibility int NOT NULL DEFAULT 80 CHECK (credibility BETWEEN 0 AND 100),
  is_primary boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  access_note text,
  last_fetched_at timestamptz,
  last_error text
);
GRANT ALL ON public.marketing_research_sources TO service_role;
ALTER TABLE public.marketing_research_sources ENABLE ROW LEVEL SECURITY;

INSERT INTO public.marketing_research_sources (key,name,publisher,kind,url,credibility,is_primary,active,access_note) VALUES
('sec_press','SEC press releases','U.S. Securities and Exchange Commission','rss','https://www.sec.gov/news/pressreleases.rss',100,true,true,'Official RSS'),
('sec_form_d','EDGAR latest Form D filings','U.S. Securities and Exchange Commission','atom','https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=D&count=40&output=atom',100,true,true,'Official EDGAR feed'),
('fr_sec','Federal Register — SEC','Federal Register','federal_register','securities-and-exchange-commission',100,true,true,'Official API'),
('fr_irs','Federal Register — IRS','Federal Register','federal_register','internal-revenue-service',100,true,true,'Official API'),
('fr_fincen','Federal Register — FinCEN','Federal Register','federal_register','financial-crimes-enforcement-network',100,true,true,'Official API'),
('fr_treasury','Federal Register — Treasury','Federal Register','federal_register','treasury-department',100,true,true,'Official API'),
('state_regulators','State securities regulators (NASAA)','NASAA / state regulators','manual',NULL,90,true,false,'Feed blocks automated access; add stories manually'),
('reuters','Reuters','Reuters','licensed',NULL,90,false,false,'Needs a Reuters license or API agreement'),
('pitchbook','PitchBook','PitchBook','licensed',NULL,85,false,false,'Needs PitchBook API access'),
('carta','Carta research','Carta','licensed',NULL,85,false,false,'Public reports only; add manually'),
('forge','Forge Global','Forge Global','licensed',NULL,80,false,false,'Public reports only; add manually'),
('nasdaq','Nasdaq IPO calendar','Nasdaq','licensed',NULL,85,false,false,'Feed blocks automated access; needs data license');

CREATE TABLE public.marketing_research_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL REFERENCES public.marketing_research_sources(key),
  dedupe_key text NOT NULL UNIQUE,
  headline text NOT NULL,
  publisher text NOT NULL,
  url text NOT NULL,
  published_at timestamptz,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  summary text NOT NULL DEFAULT '',
  primary_source_urls text[] NOT NULL DEFAULT '{}',
  facts jsonb NOT NULL DEFAULT '[]',
  numbers jsonb NOT NULL DEFAULT '[]',
  audience text NOT NULL DEFAULT '',
  suggested_series text,
  keywords text[] NOT NULL DEFAULT '{}',
  angle text NOT NULL DEFAULT '',
  timeliness int NOT NULL DEFAULT 0,
  engagement int NOT NULL DEFAULT 0,
  seo int NOT NULL DEFAULT 0,
  relevance int NOT NULL DEFAULT 0,
  commercial int NOT NULL DEFAULT 0,
  credibility int NOT NULL DEFAULT 0,
  regulatory_sensitivity text NOT NULL DEFAULT 'low' CHECK (regulatory_sensitivity IN ('low','medium','high')),
  score numeric(5,2) NOT NULL DEFAULT 0,
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('low','medium','high')),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('verified_primary','reported','unverified')),
  enriched_at timestamptz,
  dismissed_at timestamptz,
  dismissed_by uuid,
  created_by uuid
);
CREATE INDEX marketing_research_stories_score_idx ON public.marketing_research_stories(score DESC, published_at DESC);
GRANT ALL ON public.marketing_research_stories TO service_role;
ALTER TABLE public.marketing_research_stories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.marketing_research_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_key text NOT NULL REFERENCES public.marketing_series(key),
  idea_date date NOT NULL,
  title text NOT NULL,
  social_headline text NOT NULL DEFAULT '',
  angle text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT '',
  keywords text[] NOT NULL DEFAULT '{}',
  story_ids uuid[] NOT NULL DEFAULT '{}',
  claims jsonb NOT NULL DEFAULT '[]',
  unverified_claims int NOT NULL DEFAULT 0,
  converted_item_id uuid REFERENCES public.marketing_content_items(id),
  converted_by uuid,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_research_ideas_date_idx ON public.marketing_research_ideas(idea_date DESC, series_key);
GRANT ALL ON public.marketing_research_ideas TO service_role;
ALTER TABLE public.marketing_research_ideas ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.marketing_content_citations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.marketing_content_items(id),
  story_id uuid REFERENCES public.marketing_research_stories(id),
  claim text NOT NULL,
  claim_kind text NOT NULL CHECK (claim_kind IN ('fact','analysis','opinion','projection','hypothetical')),
  source_url text,
  verification text NOT NULL CHECK (verification IN ('verified_primary','reported','unverified','not_applicable')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.marketing_content_citations TO service_role;
ALTER TABLE public.marketing_content_citations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER mccit_append_only BEFORE UPDATE OR DELETE ON public.marketing_content_citations FOR EACH ROW EXECUTE FUNCTION public.block_marketing_studio_history_mutation();

ALTER TABLE public.marketing_content_items ADD COLUMN IF NOT EXISTS research_idea_id uuid REFERENCES public.marketing_research_ideas(id);
ALTER TABLE public.marketing_content_items ADD COLUMN IF NOT EXISTS unverified_claims int NOT NULL DEFAULT 0;

CREATE TABLE public.marketing_research_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL UNIQUE REFERENCES public.marketing_research_stories(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by uuid,
  acknowledged_at timestamptz
);
GRANT ALL ON public.marketing_research_alerts TO service_role;
ALTER TABLE public.marketing_research_alerts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.marketing_research_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  lease_until timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'running',
  result jsonb NOT NULL DEFAULT '{}',
  error text
);
CREATE INDEX marketing_research_runs_job_idx ON public.marketing_research_runs(job, started_at DESC);
GRANT ALL ON public.marketing_research_runs TO service_role;
ALTER TABLE public.marketing_research_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.marketing_research_state (
  job text PRIMARY KEY,
  paused_reason text,
  paused_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.marketing_research_state TO service_role;
ALTER TABLE public.marketing_research_state ENABLE ROW LEVEL SECURITY;