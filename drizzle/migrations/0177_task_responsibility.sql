ALTER TABLE public.staff_tasks
  ADD COLUMN responsibility_status text NOT NULL DEFAULT 'HARMONIOUS_HANDLING',
  ADD COLUMN responsibility_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN waiting_on_type text,
  ADD COLUMN waiting_on_name text,
  ADD COLUMN waiting_on_entity_id uuid,
  ADD COLUMN responsibility_note_internal text,
  ADD COLUMN responsibility_note_client text,
  ADD COLUMN approval_required boolean NOT NULL DEFAULT false,
  ADD COLUMN information_required boolean NOT NULL DEFAULT false,
  ADD COLUMN related_investor_id uuid,
  ADD COLUMN related_entity_id uuid,
  ADD COLUMN related_workflow_type text,
  ADD COLUMN related_workflow_id uuid,
  ADD COLUMN sla_due_date date,
  ADD COLUMN approval_type text,
  ADD COLUMN approval_record_id uuid,
  ADD COLUMN approval_amount numeric(18,2),
  ADD COLUMN approval_due_date date,
  ADD COLUMN approval_status text,
  ADD COLUMN prepared_by uuid,
  ADD COLUMN reviewed_by uuid,
  ADD COLUMN supporting_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN information_request_type text,
  ADD COLUMN requested_information text,
  ADD COLUMN required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN requested_date date,
  ADD COLUMN submitted_date date,
  ADD COLUMN submitted_by uuid;

UPDATE public.staff_tasks SET responsibility_status = 'COMPLETED' WHERE status IN ('done','cancelled');
UPDATE public.staff_tasks SET responsible_party_type = CASE responsibility_status WHEN 'COMPLETED' THEN 'COMPLETED' ELSE 'HARMONIOUS' END WHERE responsible_party_type IS NULL;

ALTER TABLE public.staff_tasks ADD CONSTRAINT staff_tasks_responsibility_status_check CHECK (responsibility_status IN ('HARMONIOUS_HANDLING','CLIENT_APPROVAL_REQUIRED','CLIENT_INFORMATION_REQUIRED','WAITING_ON_INVESTOR','WAITING_ON_THIRD_PARTY','COMPLETED'));
ALTER TABLE public.staff_tasks ADD CONSTRAINT staff_tasks_waiting_on_type_check CHECK (waiting_on_type IS NULL OR waiting_on_type IN ('BANK','AUDITOR','TAX_PREPARER','ATTORNEY','CUSTODIAN','TRANSFER_AGENT','REGISTERED_AGENT','VALUATION_PROVIDER','ISSUER','OTHER'));
CREATE INDEX staff_tasks_responsibility_idx ON public.staff_tasks (offering_id, responsibility_status);

-- Automatic rules: completion always wins (genuine workflow change); reopening a completed task returns it to Harmonious unless staff set it manually; party type mirrors status; changes are logged.
CREATE OR REPLACE FUNCTION public.staff_task_responsibility_sync() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE old_r text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.responsibility_status END;
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
  RETURN NEW;
END $$;
CREATE TRIGGER staff_task_responsibility_sync BEFORE INSERT OR UPDATE ON public.staff_tasks FOR EACH ROW EXECUTE FUNCTION public.staff_task_responsibility_sync();

CREATE OR REPLACE FUNCTION public.staff_task_responsibility_log() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.responsibility_status IS DISTINCT FROM OLD.responsibility_status AND NOT NEW.responsibility_manual THEN
    INSERT INTO public.staff_task_events (task_id, actor_user_id, kind, detail)
    VALUES (NEW.id, NULL, 'responsibility', jsonb_build_object('from', OLD.responsibility_status, 'to', NEW.responsibility_status, 'reason', 'Automatic: workflow status changed', 'automatic', true));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER staff_task_responsibility_log AFTER UPDATE ON public.staff_tasks FOR EACH ROW EXECUTE FUNCTION public.staff_task_responsibility_log();