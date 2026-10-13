ALTER TABLE public.crm_deals ALTER COLUMN contact_id DROP NOT NULL;
ALTER TABLE public.crm_deals
  ADD COLUMN IF NOT EXISTS hs_pipeline_id text,
  ADD COLUMN IF NOT EXISTS hs_pipeline_label text,
  ADD COLUMN IF NOT EXISTS hs_stage_id text,
  ADD COLUMN IF NOT EXISTS hs_stage_label text,
  ADD COLUMN IF NOT EXISTS hs_owner_id text,
  ADD COLUMN IF NOT EXISTS hs_owner_email text,
  ADD COLUMN IF NOT EXISTS hs_owner_name text,
  ADD COLUMN IF NOT EXISTS hs_amount_raw text,
  ADD COLUMN IF NOT EXISTS hs_currency text,
  ADD COLUMN IF NOT EXISTS hs_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_properties jsonb,
  ADD COLUMN IF NOT EXISTS company_names text[];
CREATE UNIQUE INDEX IF NOT EXISTS crm_deals_external_uniq ON public.crm_deals(external_source, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE public.crm_deal_associations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.crm_deals(id) ON DELETE RESTRICT,
  object_type text NOT NULL,
  external_id text NOT NULL,
  association_types text[] NOT NULL DEFAULT '{}',
  crm_contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE RESTRICT,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, object_type, external_id)
);
GRANT ALL ON public.crm_deal_associations TO service_role;
ALTER TABLE public.crm_deal_associations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.crm_deal_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.crm_deals(id) ON DELETE RESTRICT,
  external_source text NOT NULL,
  external_id text NOT NULL,
  kind text NOT NULL,
  occurred_at timestamptz,
  subject text,
  snippet text,
  properties jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_source, external_id, deal_id)
);
GRANT ALL ON public.crm_deal_history TO service_role;
ALTER TABLE public.crm_deal_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.hubspot_stage_map (
  hs_pipeline_id text NOT NULL,
  hs_stage_id text NOT NULL,
  pipeline_label text NOT NULL,
  stage_label text NOT NULL,
  display_order int,
  is_closed boolean,
  probability numeric,
  harmonious_stage text NOT NULL CHECK (harmonious_stage IN ('lead','contacted','meeting','proposal','committed','won','lost')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hs_pipeline_id, hs_stage_id)
);
GRANT ALL ON public.hubspot_stage_map TO service_role;
ALTER TABLE public.hubspot_stage_map ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.hubspot_deal_migration_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('initial','incremental')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  phase text NOT NULL DEFAULT 'active',
  cursor text,
  since timestamptz,
  started_by uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  batches int NOT NULL DEFAULT 0,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb
);
GRANT ALL ON public.hubspot_deal_migration_runs TO service_role;
ALTER TABLE public.hubspot_deal_migration_runs ENABLE ROW LEVEL SECURITY;