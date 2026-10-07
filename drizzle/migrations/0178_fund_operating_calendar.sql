-- Step 3 hardening: log every automatic responsibility transition (including after a manual label), with status context.
CREATE OR REPLACE FUNCTION public.staff_task_responsibility_sync() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('done','cancelled') THEN
    NEW.responsibility_status := 'COMPLETED';
  ELSIF TG_OP = 'UPDATE' AND OLD.status IN ('done','cancelled') AND NEW.responsibility_status = 'COMPLETED' THEN
    NEW.responsibility_status := 'HARMONIOUS_HANDLING'; NEW.responsibility_manual := false;
  END IF;
  NEW.approval_required := NEW.responsibility_status = 'CLIENT_APPROVAL_REQUIRED';
  NEW.information_required := NEW.responsibility_status = 'CLIENT_INFORMATION_REQUIRED';
  NEW.responsible_party_type := CASE NEW.responsibility_status
    WHEN 'HARMONIOUS_HANDLING' THEN 'HARMONIOUS' WHEN 'CLIENT_APPROVAL_REQUIRED' THEN 'CLIENT_APPROVAL'
    WHEN 'CLIENT_INFORMATION_REQUIRED' THEN 'CLIENT_INFORMATION' WHEN 'WAITING_ON_INVESTOR' THEN 'INVESTOR'
    WHEN 'WAITING_ON_THIRD_PARTY' THEN 'THIRD_PARTY' ELSE 'COMPLETED' END;
  IF NEW.information_required AND NEW.requested_date IS NULL THEN NEW.requested_date := current_date; END IF;
  IF TG_OP = 'UPDATE' AND OLD.information_required AND NOT NEW.information_required AND NEW.submitted_date IS NULL THEN NEW.submitted_date := current_date; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.staff_task_responsibility_log() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE why text;
BEGIN
  IF NEW.responsibility_status IS NOT DISTINCT FROM OLD.responsibility_status THEN RETURN NEW; END IF;
  -- Manual corrections without a workflow status change are logged by the server with the staff reason.
  IF NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.responsibility_manual AND NOT COALESCE(NEW.related_workflow_type, '') LIKE 'auto:%' THEN RETURN NEW; END IF;
  why := CASE
    WHEN NEW.status = 'done' THEN 'Task completed'
    WHEN NEW.status = 'cancelled' THEN 'Task cancelled'
    WHEN OLD.status IN ('done','cancelled') THEN 'Task reopened'
    WHEN OLD.responsibility_status = 'CLIENT_INFORMATION_REQUIRED' THEN 'Information received'
    WHEN OLD.responsibility_status = 'CLIENT_APPROVAL_REQUIRED' THEN 'Approval transition'
    ELSE 'Workflow transition' END;
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_task_events e WHERE e.task_id = NEW.id AND e.kind = 'responsibility'
      AND e.detail->>'from' = OLD.responsibility_status AND e.detail->>'to' = NEW.responsibility_status
      AND e.created_at > now() - interval '5 seconds'
  ) THEN
    INSERT INTO public.staff_task_events (task_id, actor_user_id, kind, detail)
    VALUES (NEW.id, NULL, 'responsibility', jsonb_build_object('from', OLD.responsibility_status, 'to', NEW.responsibility_status,
      'status_from', OLD.status, 'status_to', NEW.status, 'reason', why, 'automatic', true));
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE public.staff_tasks DROP CONSTRAINT staff_tasks_source_check;
ALTER TABLE public.staff_tasks ADD CONSTRAINT staff_tasks_source_check CHECK (source IN ('manual','hubspot','calendar','workflow'));

-- Operating calendar
CREATE TABLE public.fund_calendar_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  template_key text,
  feature_key text,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  category text NOT NULL,
  cadence text NOT NULL CHECK (cadence IN ('MONTHLY','QUARTERLY','ANNUAL')),
  due_day_offset integer NOT NULL DEFAULT 15 CHECK (due_day_offset BETWEEN 0 AND 365),
  annual_month integer CHECK (annual_month BETWEEN 1 AND 12),
  annual_day integer CHECK (annual_day BETWEEN 1 AND 31),
  responsible_party text NOT NULL DEFAULT 'HARMONIOUS_HANDLING',
  responsible_team text,
  client_visibility boolean NOT NULL DEFAULT true,
  generate_task boolean NOT NULL DEFAULT false,
  task_lead_days integer NOT NULL DEFAULT 10 CHECK (task_lead_days BETWEEN 0 AND 120),
  active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','ENTITLEMENT')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fund_calendar_rules_template_uq ON public.fund_calendar_rules (fund_id, template_key) WHERE template_key IS NOT NULL;

CREATE TABLE public.fund_calendar_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  category text NOT NULL CHECK (category IN ('ACCOUNTING','NAV','INVESTOR','CAPITAL','REPORTING','TAX','REGULATORY','AUDIT','ENTITY','BANKING','OTHER')),
  due_date date NOT NULL,
  start_date date,
  rule_id uuid REFERENCES public.fund_calendar_rules(id) ON DELETE SET NULL,
  period_label text,
  responsible_party text NOT NULL DEFAULT 'HARMONIOUS_HANDLING' CHECK (responsible_party IN ('HARMONIOUS_HANDLING','CLIENT_APPROVAL_REQUIRED','CLIENT_INFORMATION_REQUIRED','WAITING_ON_INVESTOR','WAITING_ON_THIRD_PARTY','COMPLETED')),
  responsible_team text,
  task_id uuid UNIQUE REFERENCES public.staff_tasks(id) ON DELETE SET NULL,
  workflow_type text,
  workflow_id uuid,
  client_visibility boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','IN_PROGRESS','DONE','CANCELLED')),
  report_status text CHECK (report_status IS NULL OR report_status IN ('SCHEDULED','PREPARING','INTERNAL_REVIEW','CLIENT_REVIEW','FINAL','RELEASED')),
  generate_task boolean NOT NULL DEFAULT false,
  task_lead_days integer NOT NULL DEFAULT 10,
  notes_internal text,
  notes_client text,
  source text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','RECURRING','TASK','CAPITAL_CALL','DISTRIBUTION','REPORTING','NAV','TAX','REGULATORY','AUDIT','ENTITY','SERVICE_ENGAGEMENT')),
  source_ref text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fund_calendar_items_source_uq ON public.fund_calendar_items (fund_id, source, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX fund_calendar_items_fund_due_idx ON public.fund_calendar_items (fund_id, due_date);

CREATE TABLE public.fund_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid,
  rule_id uuid,
  fund_id uuid NOT NULL,
  actor_user_id uuid,
  kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fund_calendar_events_item_idx ON public.fund_calendar_events (item_id, created_at);

GRANT ALL ON public.fund_calendar_rules TO service_role;
GRANT ALL ON public.fund_calendar_items TO service_role;
GRANT ALL ON public.fund_calendar_events TO service_role;
ALTER TABLE public.fund_calendar_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_calendar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_fund_calendar_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fund_calendar_events is append-only'; END $$;
CREATE TRIGGER fund_calendar_events_append_only BEFORE UPDATE OR DELETE ON public.fund_calendar_events FOR EACH ROW EXECUTE FUNCTION public.block_fund_calendar_event_mutation();

CREATE OR REPLACE FUNCTION public.fund_calendar_item_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ch jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.fund_calendar_events (item_id, fund_id, actor_user_id, kind, detail) VALUES (NEW.id, NEW.fund_id, NEW.created_by, 'created', jsonb_build_object('source', NEW.source, 'due_date', NEW.due_date));
    RETURN NEW;
  END IF;
  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN ch := ch || jsonb_build_object('due_date', jsonb_build_array(OLD.due_date, NEW.due_date)); END IF;
  IF NEW.rule_id IS DISTINCT FROM OLD.rule_id THEN ch := ch || jsonb_build_object('recurrence', jsonb_build_array(OLD.rule_id, NEW.rule_id)); END IF;
  IF NEW.responsible_party IS DISTINCT FROM OLD.responsible_party THEN ch := ch || jsonb_build_object('responsibility', jsonb_build_array(OLD.responsible_party, NEW.responsible_party)); END IF;
  IF NEW.client_visibility IS DISTINCT FROM OLD.client_visibility THEN ch := ch || jsonb_build_object('visibility', jsonb_build_array(OLD.client_visibility, NEW.client_visibility)); END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN ch := ch || jsonb_build_object('status', jsonb_build_array(OLD.status, NEW.status)); END IF;
  IF NEW.report_status IS DISTINCT FROM OLD.report_status THEN ch := ch || jsonb_build_object('report_status', jsonb_build_array(OLD.report_status, NEW.report_status)); END IF;
  IF NEW.task_id IS DISTINCT FROM OLD.task_id THEN ch := ch || jsonb_build_object('task', jsonb_build_array(OLD.task_id, NEW.task_id)); END IF;
  IF ch <> '{}'::jsonb THEN
    INSERT INTO public.fund_calendar_events (item_id, fund_id, kind, detail) VALUES (NEW.id, NEW.fund_id, CASE WHEN NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED' THEN 'cancelled' ELSE 'updated' END, ch);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fund_calendar_item_history AFTER INSERT OR UPDATE ON public.fund_calendar_items FOR EACH ROW EXECUTE FUNCTION public.fund_calendar_item_history();

CREATE OR REPLACE FUNCTION public.fund_calendar_rule_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.fund_calendar_events (rule_id, fund_id, actor_user_id, kind, detail)
  VALUES (NEW.id, NEW.fund_id, NEW.created_by, CASE WHEN TG_OP = 'INSERT' THEN 'rule_created' ELSE 'rule_updated' END,
    jsonb_build_object('cadence', NEW.cadence, 'due_day_offset', NEW.due_day_offset, 'active', NEW.active, 'generate_task', NEW.generate_task, 'task_lead_days', NEW.task_lead_days));
  RETURN NEW;
END $$;
CREATE TRIGGER fund_calendar_rule_history AFTER INSERT OR UPDATE ON public.fund_calendar_rules FOR EACH ROW EXECUTE FUNCTION public.fund_calendar_rule_history();

-- Completing a calendar-generated task completes its calendar item.
CREATE OR REPLACE FUNCTION public.staff_task_calendar_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.fund_calendar_items SET
      status = CASE WHEN NEW.status = 'done' THEN 'DONE' WHEN NEW.status = 'cancelled' THEN status WHEN NEW.status = 'in_progress' THEN 'IN_PROGRESS' ELSE 'SCHEDULED' END,
      responsible_party = NEW.responsibility_status, updated_at = now()
    WHERE task_id = NEW.id;
  ELSIF NEW.responsibility_status IS DISTINCT FROM OLD.responsibility_status THEN
    UPDATE public.fund_calendar_items SET responsible_party = NEW.responsibility_status, updated_at = now() WHERE task_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER staff_task_calendar_sync AFTER UPDATE ON public.staff_tasks FOR EACH ROW EXECUTE FUNCTION public.staff_task_calendar_sync();