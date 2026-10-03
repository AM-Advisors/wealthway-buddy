ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'account_executive';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'bdr';

ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS service_key text;
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS follow_up_at date;
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS connected_via text;
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id);
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id);

CREATE OR REPLACE FUNCTION public.block_sales_history_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Sales history is append-only'; END $$;

CREATE TABLE public.sales_outreach (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.crm_contacts(id),
  deal_id uuid REFERENCES public.crm_deals(id),
  owner_user_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','text','whatsapp','linkedin','call','event','other')),
  direction text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  subject text,
  body text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  service_key text,
  stage_after text,
  visibility text NOT NULL DEFAULT 'team' CHECK (visibility IN ('team','private')),
  source text NOT NULL DEFAULT 'logged' CHECK (source IN ('sent','logged','pulled_in')),
  delivery_status text,
  provider_ref text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sales_outreach_owner_idx ON public.sales_outreach(owner_user_id, occurred_at DESC);
CREATE INDEX sales_outreach_contact_idx ON public.sales_outreach(contact_id, occurred_at DESC);
GRANT ALL ON public.sales_outreach TO service_role;
ALTER TABLE public.sales_outreach ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER sales_outreach_append_only BEFORE UPDATE OR DELETE ON public.sales_outreach FOR EACH ROW EXECUTE FUNCTION public.block_sales_history_mutation();

CREATE TABLE public.sales_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.crm_deals(id),
  from_stage text,
  to_stage text NOT NULL,
  connected_via text,
  follow_up_at date,
  loss_reason text,
  note text,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sales_stage_events_deal_idx ON public.sales_stage_events(deal_id, created_at);
GRANT ALL ON public.sales_stage_events TO service_role;
ALTER TABLE public.sales_stage_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER sales_stage_events_append_only BEFORE UPDATE OR DELETE ON public.sales_stage_events FOR EACH ROW EXECUTE FUNCTION public.block_sales_history_mutation();

CREATE TABLE public.sales_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  revenue_target_cents bigint NOT NULL DEFAULT 0,
  outreach_target integer NOT NULL DEFAULT 0,
  set_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_start, period_end)
);
GRANT ALL ON public.sales_targets TO service_role;
ALTER TABLE public.sales_targets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sales_reporting_lines (
  user_id uuid PRIMARY KEY,
  manager_user_id uuid,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sales_reporting_lines TO service_role;
ALTER TABLE public.sales_reporting_lines ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sales_channel_optouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id),
  channel text NOT NULL CHECK (channel IN ('email','text','whatsapp')),
  recorded_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, channel)
);
GRANT ALL ON public.sales_channel_optouts TO service_role;
ALTER TABLE public.sales_channel_optouts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sales_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number bigserial,
  version integer NOT NULL DEFAULT 1,
  supersedes_id uuid REFERENCES public.sales_quotes(id),
  deal_id uuid REFERENCES public.crm_deals(id),
  contact_id uuid REFERENCES public.crm_contacts(id),
  client_id uuid REFERENCES public.clients(id),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','rejected','sent','signed','lost','superseded')),
  owner_user_id uuid NOT NULL,
  created_by uuid NOT NULL,
  total_cents bigint NOT NULL DEFAULT 0,
  baseline_cents bigint NOT NULL DEFAULT 0,
  needs_exec_approval boolean NOT NULL DEFAULT false,
  pricing_version_id uuid,
  approved_by uuid,
  approved_at timestamptz,
  decision_note text,
  sow_id uuid REFERENCES public.client_sows(id),
  msa_id uuid REFERENCES public.client_msa_agreements(id),
  sent_at timestamptz,
  signed_at timestamptz,
  valid_until date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sales_quotes TO service_role;
ALTER TABLE public.sales_quotes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sales_quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.sales_quotes(id),
  service_key text NOT NULL,
  label text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_cents bigint NOT NULL,
  baseline_unit_cents bigint NOT NULL DEFAULT 0,
  line_cents bigint NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sales_quote_lines TO service_role;
ALTER TABLE public.sales_quote_lines ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sales_quote_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.sales_quotes(id),
  event text NOT NULL,
  actor_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sales_quote_events TO service_role;
ALTER TABLE public.sales_quote_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER sales_quote_events_append_only BEFORE UPDATE OR DELETE ON public.sales_quote_events FOR EACH ROW EXECUTE FUNCTION public.block_sales_history_mutation();