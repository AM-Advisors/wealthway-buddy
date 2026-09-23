-- Public website leads (contact / Schedule a Demo). Written only by the
-- validated server function using the service role; never readable or writable
-- by browsers. A lead never creates any application account or authority.
CREATE TABLE public.marketing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  work_email text NOT NULL CHECK (char_length(work_email) BETWEEN 3 AND 254),
  company text NOT NULL CHECK (char_length(company) BETWEEN 1 AND 160),
  intent text NOT NULL CHECK (intent IN ('fund_administration','spv','cap_table','investor_onboarding','fund_migration','partnership','other')),
  message text CHECK (message IS NULL OR char_length(message) <= 2000),
  cta text,
  source_page text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer text,
  -- Salesforce readiness: sync state recorded here once the integration exists.
  crm_status text NOT NULL DEFAULT 'pending' CHECK (crm_status IN ('pending','synced','failed','skipped')),
  crm_external_id text,
  crm_synced_at timestamptz,
  crm_error text
);

GRANT ALL ON public.marketing_leads TO service_role;
REVOKE ALL ON public.marketing_leads FROM anon, authenticated;

ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;
-- No policies: browsers have no access at all.

CREATE INDEX marketing_leads_crm_pending_idx ON public.marketing_leads (created_at) WHERE crm_status = 'pending';