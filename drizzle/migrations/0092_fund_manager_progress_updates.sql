-- Fund managers hear about new assignments and Fund Setup progress through the existing notification_events outbox.
CREATE OR REPLACE FUNCTION public.notify_fund_manager_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notification_events (event_kind, offering_id, metadata)
  VALUES ('fund_assigned', NEW.offering_id,
    jsonb_build_object('audience','managers','recipient_user_id', NEW.user_id, 'portal_path', '/manager/fund/' || NEW.offering_id));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_fund_manager_assigned ON public.fund_managers;
CREATE TRIGGER trg_notify_fund_manager_assigned AFTER INSERT ON public.fund_managers
FOR EACH ROW EXECUTE FUNCTION public.notify_fund_manager_assigned();

CREATE OR REPLACE FUNCTION public.notify_fund_setup_task_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_offering uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('complete','completed','done','in_progress','blocked') THEN RETURN NEW; END IF;
  SELECT offering_id INTO v_offering FROM public.fund_setups WHERE id = NEW.setup_id;
  IF v_offering IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notification_events (event_kind, offering_id, field, old_value, new_value, metadata)
  VALUES ('setup_task_progress', v_offering, NEW.label, OLD.status, NEW.status,
    jsonb_build_object('audience','managers','section', NEW.section, 'task_key', NEW.task_key, 'portal_path', '/manager/fund/' || v_offering));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_fund_setup_task_progress ON public.fund_setup_tasks;
CREATE TRIGGER trg_notify_fund_setup_task_progress AFTER UPDATE OF status ON public.fund_setup_tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_fund_setup_task_progress();

CREATE OR REPLACE FUNCTION public.notify_fund_service_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('submitted','completed','exempt') THEN RETURN NEW; END IF;
  INSERT INTO public.notification_events (event_kind, offering_id, field, old_value, new_value, metadata)
  VALUES ('service_progress', NEW.offering_id, NEW.kind, OLD.status, NEW.status,
    jsonb_build_object('audience','managers','portal_path', '/manager/fund/' || NEW.offering_id));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_fund_service_progress ON public.fund_service_orders;
CREATE TRIGGER trg_notify_fund_service_progress AFTER UPDATE OF status ON public.fund_service_orders
FOR EACH ROW EXECUTE FUNCTION public.notify_fund_service_progress();

CREATE OR REPLACE FUNCTION public.notify_fund_launch_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.offering_id IS NULL OR NEW.launch_state IS NOT DISTINCT FROM OLD.launch_state THEN RETURN NEW; END IF;
  INSERT INTO public.notification_events (event_kind, offering_id, field, old_value, new_value, metadata)
  VALUES ('launch_progress', NEW.offering_id, 'launch_state', OLD.launch_state, NEW.launch_state,
    jsonb_build_object('audience','managers','portal_path', '/manager/fund/' || NEW.offering_id));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_fund_launch_progress ON public.fund_setups;
CREATE TRIGGER trg_notify_fund_launch_progress AFTER UPDATE OF launch_state ON public.fund_setups
FOR EACH ROW EXECUTE FUNCTION public.notify_fund_launch_progress();

REVOKE EXECUTE ON FUNCTION public.notify_fund_manager_assigned(), public.notify_fund_setup_task_progress(), public.notify_fund_service_progress(), public.notify_fund_launch_progress() FROM PUBLIC, anon, authenticated;