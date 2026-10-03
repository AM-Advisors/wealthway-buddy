CREATE TABLE public.marketing_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('campaign','flow')),
  email_id uuid,
  flow_send_id uuid,
  recipient text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('open','click')),
  url text,
  ip_hash text,
  user_agent text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_email_events_recipient_idx ON public.marketing_email_events (lower(recipient), occurred_at DESC);
CREATE INDEX marketing_email_events_email_idx ON public.marketing_email_events (email_id);
CREATE INDEX marketing_email_events_flow_idx ON public.marketing_email_events (flow_send_id);
GRANT ALL ON public.marketing_email_events TO service_role;
ALTER TABLE public.marketing_email_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.email_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  audience text NOT NULL DEFAULT 'any' CHECK (audience IN ('prospect','client','any')),
  trigger_kind text NOT NULL DEFAULT 'manual' CHECK (trigger_kind IN ('manual','stage_change','client_signed','email_click')),
  trigger_stage text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.email_flows TO service_role;
ALTER TABLE public.email_flows ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.email_flow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.email_flows(id),
  position integer NOT NULL,
  delay_days integer NOT NULL DEFAULT 0 CHECK (delay_days >= 0 AND delay_days <= 365),
  subject text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flow_id, position)
);
GRANT ALL ON public.email_flow_steps TO service_role;
ALTER TABLE public.email_flow_steps ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.email_flow_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.email_flows(id),
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id),
  deal_id uuid,
  owner_user_id uuid,
  enrolled_by uuid,
  enrolled_via text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','stopped')),
  next_step integer NOT NULL DEFAULT 1,
  next_due_at timestamptz,
  stop_reason text,
  stopped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX email_flow_enrollments_one_active ON public.email_flow_enrollments (flow_id, contact_id) WHERE status = 'active';
CREATE INDEX email_flow_enrollments_due ON public.email_flow_enrollments (status, next_due_at);
GRANT ALL ON public.email_flow_enrollments TO service_role;
ALTER TABLE public.email_flow_enrollments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.email_flow_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.email_flow_enrollments(id),
  step_id uuid NOT NULL REFERENCES public.email_flow_steps(id),
  position integer NOT NULL,
  recipient text NOT NULL,
  subject text NOT NULL,
  outcome text NOT NULL DEFAULT 'sent' CHECK (outcome IN ('sent','skipped')),
  sent_by uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.email_flow_sends TO service_role;
ALTER TABLE public.email_flow_sends ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_email_engagement_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'This history is append-only'; END $$;
CREATE TRIGGER marketing_email_events_append_only BEFORE UPDATE OR DELETE ON public.marketing_email_events FOR EACH ROW EXECUTE FUNCTION public.block_email_engagement_mutation();
CREATE TRIGGER email_flow_sends_append_only BEFORE UPDATE OR DELETE ON public.email_flow_sends FOR EACH ROW EXECUTE FUNCTION public.block_email_engagement_mutation();