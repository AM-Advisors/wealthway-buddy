ALTER TABLE public.pricing_items ADD COLUMN IF NOT EXISTS historical boolean NOT NULL DEFAULT false;
ALTER TABLE public.pricing_items ADD COLUMN IF NOT EXISTS available_for_new_quotes boolean NOT NULL DEFAULT true;
ALTER TABLE public.pricing_items ADD COLUMN IF NOT EXISTS retired_reason text;
ALTER TABLE public.pricing_items ADD COLUMN IF NOT EXISTS retired_at timestamptz;

-- Internal operations configuration (weights, capacity, limits). Never client-readable.
CREATE TABLE public.ops_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT ALL ON public.ops_settings TO service_role;
ALTER TABLE public.ops_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ops_settings_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL, old_value jsonb, new_value jsonb, reason text,
  actor_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ops_settings_events TO service_role;
ALTER TABLE public.ops_settings_events ENABLE ROW LEVEL SECURITY;

-- Configurable high-risk approval policies (replace fixed thresholds).
CREATE TABLE public.approval_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_type text NOT NULL,
  threshold_amount numeric,
  currency text NOT NULL DEFAULT 'USD',
  second_approver_required boolean NOT NULL DEFAULT true,
  step_up_required boolean NOT NULL DEFAULT false,
  authorized_signer_required boolean NOT NULL DEFAULT false,
  client_id uuid,
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT ALL ON public.approval_policies TO service_role;
ALTER TABLE public.approval_policies ENABLE ROW LEVEL SECURITY;

-- Exception state for deterministic, derived exceptions (keyed by type + record).
CREATE TABLE public.ops_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_type text NOT NULL CHECK (exception_type IN ('OVERDUE_TASK','SLA_RISK','SLA_BREACH','MISSING_ASSIGNMENT','MISSING_KYC','MISSING_KYB','MISSING_ACCREDITATION','MISSING_SUBSCRIPTION','CAPITAL_CALL_OVERDUE','FUNDING_SHORTFALL','REPORTING_OVERDUE','CALENDAR_DEADLINE_OVERDUE','SERVICE_LIMIT_APPROACHING','SERVICE_LIMIT_EXCEEDED','OTHER')),
  source_ref text NOT NULL,
  fund_id uuid,
  related_record_type text,
  related_record_id text,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','DISMISSED')),
  title text NOT NULL,
  assigned_team text,
  assigned_user_id uuid,
  detected_at timestamptz NOT NULL DEFAULT now(),
  due_date date,
  follow_up_date date,
  resolution text,
  resolved_by uuid,
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exception_type, source_ref)
);
GRANT ALL ON public.ops_exceptions TO service_role;
ALTER TABLE public.ops_exceptions ENABLE ROW LEVEL SECURITY;
CREATE INDEX ops_exceptions_open_idx ON public.ops_exceptions(status, severity) WHERE status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS');

CREATE TABLE public.ops_exception_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_id uuid NOT NULL REFERENCES public.ops_exceptions(id),
  event text NOT NULL, detail jsonb, actor_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ops_exception_events TO service_role;
ALTER TABLE public.ops_exception_events ENABLE ROW LEVEL SECURITY;

-- Service review queue.
CREATE TABLE public.service_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL,
  service_engagement_id uuid,
  trigger_type text NOT NULL,
  source_ref text NOT NULL,
  reason text NOT NULL,
  usage_detail jsonb,
  status text NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK (status IN ('REVIEW_REQUIRED','IN_REVIEW','CLIENT_DISCUSSION','QUOTE_PREPARED','RESOLVED','NO_CHANGE')),
  owner_user_id uuid,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trigger_type, source_ref)
);
GRANT ALL ON public.service_reviews TO service_role;
ALTER TABLE public.service_reviews ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.service_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.service_reviews(id),
  event text NOT NULL, from_status text, to_status text, note text, actor_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.service_review_events TO service_role;
ALTER TABLE public.service_review_events ENABLE ROW LEVEL SECURITY;

-- Follow-up / reminder tracking for client action items (no automatic sends).
ALTER TABLE public.staff_tasks ADD COLUMN IF NOT EXISTS follow_up_date date;
ALTER TABLE public.staff_tasks ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz;
ALTER TABLE public.staff_tasks ADD COLUMN IF NOT EXISTS escalated_at timestamptz;
ALTER TABLE public.staff_tasks ADD COLUMN IF NOT EXISTS waiting_since timestamptz;

-- Future staff time entries (architecture only; no required entry).
CREATE TABLE public.staff_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  minutes integer NOT NULL CHECK (minutes > 0),
  work_date date NOT NULL DEFAULT current_date,
  service_engagement_id uuid, fund_id uuid, task_id uuid, request_id uuid, approval_id uuid,
  workflow_type text, workflow_id text, note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.staff_time_entries TO service_role;
ALTER TABLE public.staff_time_entries ENABLE ROW LEVEL SECURITY;

-- Saved filter views (per staff member).
CREATE TABLE public.ops_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  view text NOT NULL,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ops_saved_views TO service_role;
ALTER TABLE public.ops_saved_views ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS staff_tasks_open_ops_idx ON public.staff_tasks(status, due_date) WHERE status NOT IN ('done','cancelled');
CREATE INDEX IF NOT EXISTS fund_service_requests_open_idx ON public.fund_service_requests(status, sla_due_at);
CREATE INDEX IF NOT EXISTS approvals_status_idx ON public.approvals(status, due_date);
CREATE INDEX IF NOT EXISTS fund_calendar_items_due_idx ON public.fund_calendar_items(due_date, status);