CREATE TABLE public.fund_calendar_settings (
  fund_id uuid PRIMARY KEY REFERENCES public.offerings(id) ON DELETE CASCADE,
  auto_task_generation boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_calendar_settings TO service_role;
ALTER TABLE public.fund_calendar_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fund_calendar_items
  ADD COLUMN occurrence_key text,
  ADD COLUMN task_created_at timestamptz;
UPDATE public.fund_calendar_items SET occurrence_key = id::text || ':' || due_date::text WHERE occurrence_key IS NULL;
CREATE UNIQUE INDEX fund_calendar_items_occurrence_uq ON public.fund_calendar_items (occurrence_key) WHERE occurrence_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fund_calendar_item_occurrence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.occurrence_key IS NULL THEN NEW.occurrence_key := NEW.id::text || ':' || NEW.due_date::text; END IF;
  IF NEW.task_id IS NOT NULL AND NEW.task_created_at IS NULL THEN NEW.task_created_at := now(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fund_calendar_item_occurrence BEFORE INSERT OR UPDATE ON public.fund_calendar_items FOR EACH ROW EXECUTE FUNCTION public.fund_calendar_item_occurrence();

CREATE OR REPLACE FUNCTION public.generate_due_calendar_tasks() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer := 0; r record; tid uuid;
BEGIN
  FOR r IN
    SELECT i.* FROM public.fund_calendar_items i
    LEFT JOIN public.fund_calendar_settings s ON s.fund_id = i.fund_id
    LEFT JOIN public.fund_calendar_rules ru ON ru.id = i.rule_id
    WHERE i.generate_task AND i.task_id IS NULL AND i.status = 'SCHEDULED'
      AND i.due_date >= current_date - 7
      AND i.due_date - i.task_lead_days <= current_date
      AND COALESCE(s.auto_task_generation, true)
      AND (ru.id IS NULL OR ru.active)
      AND EXISTS (SELECT 1 FROM public.service_engagements e WHERE e.fund_id = i.fund_id AND e.service_status IN ('ACTIVE','PENDING_AGREEMENT','PROPOSED'))
      AND (ru.feature_key IS NULL OR EXISTS (
        SELECT 1 FROM public.service_engagements e
        WHERE e.fund_id = i.fund_id AND e.service_status IN ('ACTIVE','PENDING_AGREEMENT','PROPOSED')
          AND NOT EXISTS (SELECT 1 FROM public.service_engagement_entitlements x WHERE x.engagement_id = e.id AND x.feature_key = ru.feature_key AND x.mode = 'REMOVE')
          AND (EXISTS (SELECT 1 FROM public.service_level_entitlements d WHERE d.service_product = e.service_product AND d.service_level = e.service_level AND d.feature_key = ru.feature_key)
               OR EXISTS (SELECT 1 FROM public.service_engagement_entitlements x WHERE x.engagement_id = e.id AND x.feature_key = ru.feature_key AND x.mode = 'ADD'))))
    LIMIT 500
  LOOP
    tid := NULL;
    INSERT INTO public.staff_tasks (title, description, priority, status, team, offering_id, due_date, source, source_ref, responsibility_status, client_visibility, related_workflow_type, related_workflow_id)
    VALUES (r.title, r.notes_client, 'normal', 'open', COALESCE(r.responsible_team, 'operations'), r.fund_id, r.due_date, 'calendar', r.id::text,
      CASE WHEN r.responsible_party = 'COMPLETED' THEN 'HARMONIOUS_HANDLING' ELSE r.responsible_party END, r.client_visibility, 'calendar_item', r.id)
    ON CONFLICT (source, source_ref) WHERE source_ref IS NOT NULL DO NOTHING
    RETURNING id INTO tid;
    IF tid IS NULL THEN SELECT id INTO tid FROM public.staff_tasks WHERE source = 'calendar' AND source_ref = r.id::text;
    ELSE n := n + 1;
      INSERT INTO public.staff_task_events (task_id, kind, detail) VALUES (tid, 'created', jsonb_build_object('from_calendar', r.id, 'automatic', true));
    END IF;
    UPDATE public.fund_calendar_items SET task_id = tid, task_created_at = now(), updated_at = now() WHERE id = r.id AND task_id IS NULL;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.generate_due_calendar_tasks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_due_calendar_tasks() TO service_role;

CREATE TABLE public.fund_service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  service_engagement_id uuid REFERENCES public.service_engagements(id),
  request_type text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('DRAFT','SUBMITTED','IN_REVIEW','IN_PROGRESS','WAITING_ON_CLIENT','WAITING_ON_INVESTOR','WAITING_ON_THIRD_PARTY','READY_FOR_APPROVAL','COMPLETED','CANCELLED','CANCELLATION_REVIEW')),
  responsibility_status text NOT NULL DEFAULT 'HARMONIOUS_HANDLING',
  stage integer NOT NULL DEFAULT 0,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high','urgent')),
  urgent_reason text,
  entitlement_status text NOT NULL DEFAULT 'INCLUDED' CHECK (entitlement_status IN ('INCLUDED','ADDITIONAL','REVIEW_REQUIRED')),
  requested_by uuid, assigned_to uuid, assigned_team text,
  task_id uuid REFERENCES public.staff_tasks(id) ON DELETE SET NULL,
  review_task_id uuid REFERENCES public.staff_tasks(id) ON DELETE SET NULL,
  submitted_at timestamptz, due_date date, sla_due_at timestamptz, sla_hours integer,
  sla_paused_at timestamptz, sla_paused_minutes integer NOT NULL DEFAULT 0, first_response_at timestamptz,
  completed_at timestamptz,
  related_workflow_type text, related_workflow_id uuid,
  irreversible boolean NOT NULL DEFAULT false,
  client_visibility boolean NOT NULL DEFAULT true,
  internal_notes text, client_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fund_service_requests_fund_idx ON public.fund_service_requests (fund_id, status);

CREATE TABLE public.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.staff_tasks(id) ON DELETE SET NULL,
  service_engagement_id uuid REFERENCES public.service_engagements(id),
  service_request_id uuid REFERENCES public.fund_service_requests(id) ON DELETE SET NULL,
  approval_type text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','INTERNAL_REVIEW','AWAITING_APPROVAL','APPROVED','CHANGES_REQUESTED','WITHDRAWN','EXPIRED','COMPLETED','SUPERSEDED')),
  requested_by uuid, prepared_by uuid, reviewed_by uuid,
  approval_required_from text NOT NULL DEFAULT 'FUND_MANAGER',
  required_approver_count integer NOT NULL DEFAULT 1 CHECK (required_approver_count BETWEEN 1 AND 3),
  approval_amount numeric(18,2),
  currency text NOT NULL DEFAULT 'USD',
  effective_date date, due_date date,
  requested_at timestamptz, approved_at timestamptz, approved_by uuid,
  rejected_at timestamptz, rejected_by uuid,
  decision_notes text, client_visible_summary text, internal_notes text,
  calculation_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  supporting_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  related_workflow_type text, related_workflow_id uuid,
  version integer NOT NULL DEFAULT 1,
  supersedes_id uuid REFERENCES public.approvals(id),
  root_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX approvals_fund_idx ON public.approvals (fund_id, status);
CREATE UNIQUE INDEX approvals_one_open_version ON public.approvals (root_id) WHERE status IN ('DRAFT','INTERNAL_REVIEW','AWAITING_APPROVAL');

CREATE TABLE public.approval_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id uuid NOT NULL REFERENCES public.approvals(id) ON DELETE CASCADE,
  version integer NOT NULL,
  user_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('APPROVE','REQUEST_CHANGES')),
  certified boolean NOT NULL DEFAULT false,
  certification_text text,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (approval_id, user_id, decision)
);

CREATE TABLE public.approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id uuid NOT NULL,
  fund_id uuid NOT NULL,
  version integer,
  actor_user_id uuid,
  action text NOT NULL,
  comment text,
  client_visible boolean NOT NULL DEFAULT true,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX approval_events_idx ON public.approval_events (approval_id, created_at);

CREATE TABLE public.fund_request_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.fund_service_requests(id) ON DELETE CASCADE,
  author_user_id uuid,
  author_side text NOT NULL CHECK (author_side IN ('CLIENT','HARMONIOUS')),
  visibility text NOT NULL CHECK (visibility IN ('CLIENT','INTERNAL')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 8000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fund_request_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.fund_service_requests(id) ON DELETE CASCADE,
  fund_id uuid NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  category text NOT NULL DEFAULT 'supporting',
  uploaded_by uuid,
  visibility text NOT NULL DEFAULT 'CLIENT' CHECK (visibility IN ('CLIENT','INTERNAL')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fund_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  fund_id uuid NOT NULL,
  actor_user_id uuid,
  kind text NOT NULL,
  client_visible boolean NOT NULL DEFAULT false,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fund_request_events_idx ON public.fund_request_events (request_id, created_at);

GRANT ALL ON public.approvals, public.approval_decisions, public.approval_events, public.fund_service_requests, public.fund_request_messages, public.fund_request_files, public.fund_request_events TO service_role;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_request_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_request_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_request_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_step5_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END $$;
CREATE TRIGGER approval_events_append_only BEFORE UPDATE OR DELETE ON public.approval_events FOR EACH ROW EXECUTE FUNCTION public.block_step5_history_mutation();
CREATE TRIGGER approval_decisions_append_only BEFORE UPDATE OR DELETE ON public.approval_decisions FOR EACH ROW EXECUTE FUNCTION public.block_step5_history_mutation();
CREATE TRIGGER fund_request_events_append_only BEFORE UPDATE OR DELETE ON public.fund_request_events FOR EACH ROW EXECUTE FUNCTION public.block_step5_history_mutation();
CREATE TRIGGER fund_request_messages_append_only BEFORE UPDATE OR DELETE ON public.fund_request_messages FOR EACH ROW EXECUTE FUNCTION public.block_step5_history_mutation();

CREATE OR REPLACE FUNCTION public.approvals_freeze() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IN ('APPROVED','COMPLETED','SUPERSEDED','WITHDRAWN') AND (
     NEW.approval_amount IS DISTINCT FROM OLD.approval_amount OR NEW.calculation_summary IS DISTINCT FROM OLD.calculation_summary
     OR NEW.supporting_documents IS DISTINCT FROM OLD.supporting_documents OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.effective_date IS DISTINCT FROM OLD.effective_date OR NEW.version IS DISTINCT FROM OLD.version) THEN
    RAISE EXCEPTION 'This approval version is closed; create a new version instead';
  END IF;
  IF NEW.root_id IS NULL THEN NEW.root_id := NEW.id; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER approvals_freeze BEFORE INSERT OR UPDATE ON public.approvals FOR EACH ROW EXECUTE FUNCTION public.approvals_freeze();