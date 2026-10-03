ALTER TABLE public.marketing_posts ADD COLUMN IF NOT EXISTS external_source text, ADD COLUMN IF NOT EXISTS external_id text, ADD COLUMN IF NOT EXISTS external_url text;
ALTER TABLE public.marketing_emails ADD COLUMN IF NOT EXISTS external_source text, ADD COLUMN IF NOT EXISTS external_id text, ADD COLUMN IF NOT EXISTS external_url text, ADD COLUMN IF NOT EXISTS external_stats jsonb;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS external_source text, ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS external_source text, ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS marketing_posts_external_uq ON public.marketing_posts(external_source, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS marketing_emails_external_uq ON public.marketing_emails(external_source, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_external_uq ON public.crm_contacts(external_source, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_deals_external_uq ON public.crm_deals(external_source, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE public.marketing_import_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('clickup')),
  kind text NOT NULL CHECK (kind IN ('list','space')),
  ref_id text NOT NULL,
  name text NOT NULL,
  keep_syncing boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz,
  last_result jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, kind, ref_id)
);
GRANT ALL ON public.marketing_import_sources TO service_role;
ALTER TABLE public.marketing_import_sources ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.crm_email_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  external_source text NOT NULL,
  external_id text NOT NULL,
  direction text,
  subject text,
  snippet text,
  sent_at timestamptz,
  imported_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_source, external_id, contact_id)
);
CREATE INDEX crm_email_history_contact_idx ON public.crm_email_history(contact_id, sent_at DESC);
GRANT ALL ON public.crm_email_history TO service_role;
ALTER TABLE public.crm_email_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  actor_id uuid,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.import_runs TO service_role;
ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;