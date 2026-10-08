ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'marketing_contributor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'compliance_reviewer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'executive_approver';

CREATE TABLE public.marketing_series (
  key text PRIMARY KEY,
  name text NOT NULL,
  weekday int NOT NULL CHECK (weekday BETWEEN 1 AND 5),
  intention text NOT NULL,
  purpose text NOT NULL,
  voice text NOT NULL,
  outputs text[] NOT NULL DEFAULT '{}',
  sources text[] NOT NULL DEFAULT '{}',
  color text NOT NULL,
  guardrail text,
  active boolean NOT NULL DEFAULT true
);
GRANT ALL ON public.marketing_series TO service_role;
ALTER TABLE public.marketing_series ENABLE ROW LEVEL SECURITY;

INSERT INTO public.marketing_series (key,name,weekday,intention,purpose,voice,outputs,sources,color,guardrail) VALUES
('market_monday','Market Monday',1,'SIGNAL','Explain current market events.','Objective, analytical, timely.',ARRAY['News analysis article','LinkedIn post','Social graphic','Short-form content'],ARRAY['SEC','IRS','FinCEN','Treasury','EDGAR','Reuters','Bloomberg','WSJ','Public filings','Market research'],'#5DC6D1',NULL),
('thesis_tuesday','Thesis Tuesday',2,'POV','Explain what Harmonious believes about the future of private markets.','Confident, evidence-based, forward-looking.',ARRAY['Thought-leadership article','LinkedIn post','Discussion question','Visual'],ARRAY[]::text[],'#3B6FD8',NULL),
('whatever_wednesday','Whatever Wednesday',3,'HUMAN','Generate engagement, personality, community and brand recognition.','Approachable, occasionally humorous, professional.',ARRAY['Poll','Meme','Team content','Behind the scenes','Community question','Short video'],ARRAY[]::text[],'#F2A541',NULL),
('fund_academy_thursday','Fund Academy Thursday',4,'TEACH','Educate fund managers and investors through evergreen, searchable articles.','Clear, technically accurate, educational.',ARRAY['SEO article','FAQs','Glossary','Comparison table','LinkedIn carousel','Social summary'],ARRAY['SEC','IRS','FinCEN','Treasury','State regulators'],'#2FA37A',NULL),
('founders_friday','Founders Friday',5,'CONNECT','Founder-to-founder perspectives from Alyssa Pettit, Founder & CEO.','First-person, insightful, authentic, conversational.',ARRAY['Founder article','Personal LinkedIn post','Company LinkedIn post','Branded visual'],ARRAY['Public startup news','Fundraising','IPOs','Acquisitions'],'#C2557A','Never invent personal experiences or attribute unapproved opinions to Alyssa.');

CREATE TABLE public.marketing_content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_key text NOT NULL REFERENCES public.marketing_series(key),
  week_start date,
  publish_at timestamptz,
  article_title text NOT NULL DEFAULT '',
  social_headline text NOT NULL DEFAULT '',
  topic text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT '',
  keywords text[] NOT NULL DEFAULT '{}',
  source_urls text[] NOT NULL DEFAULT '{}',
  author_id uuid,
  reviewer_id uuid,
  status text NOT NULL DEFAULT 'idea',
  platforms text[] NOT NULL DEFAULT '{}',
  graphic_requirements text NOT NULL DEFAULT '',
  article_url text NOT NULL DEFAULT '',
  cta text NOT NULL DEFAULT '',
  campaign_id uuid,
  post_id uuid,
  article_id uuid,
  email_id uuid,
  metrics jsonb NOT NULL DEFAULT '{}',
  is_sample boolean NOT NULL DEFAULT false,
  proposed_slot boolean NOT NULL DEFAULT false,
  version int NOT NULL DEFAULT 1,
  approved_by uuid,
  approved_at timestamptz,
  ceo_approved_by uuid,
  ceo_approved_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX marketing_content_proposed_slot_uq ON public.marketing_content_items(series_key, week_start) WHERE proposed_slot;
GRANT ALL ON public.marketing_content_items TO service_role;
ALTER TABLE public.marketing_content_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.marketing_content_item_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.marketing_content_items(id),
  version int NOT NULL,
  snapshot jsonb NOT NULL,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(item_id, version)
);
CREATE TABLE public.marketing_content_item_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.marketing_content_items(id),
  action text NOT NULL,
  from_status text,
  to_status text,
  actor_id uuid NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.marketing_content_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.marketing_content_items(id),
  author_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.marketing_content_item_versions, public.marketing_content_item_events, public.marketing_content_comments TO service_role;
ALTER TABLE public.marketing_content_item_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_content_item_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_content_comments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_marketing_studio_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Marketing studio history is append-only'; END $$;
CREATE TRIGGER mcv_append_only BEFORE UPDATE OR DELETE ON public.marketing_content_item_versions FOR EACH ROW EXECUTE FUNCTION public.block_marketing_studio_history_mutation();
CREATE TRIGGER mce_append_only BEFORE UPDATE OR DELETE ON public.marketing_content_item_events FOR EACH ROW EXECUTE FUNCTION public.block_marketing_studio_history_mutation();
CREATE TRIGGER mcc_append_only BEFORE UPDATE OR DELETE ON public.marketing_content_comments FOR EACH ROW EXECUTE FUNCTION public.block_marketing_studio_history_mutation();