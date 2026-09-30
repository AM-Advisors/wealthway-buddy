CREATE OR REPLACE FUNCTION public.notify_fund_setup_task_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_offering uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  -- Manager-relevant moves only: finished, ready for review, or waiting on the client.
  IF NEW.status NOT IN ('complete','review','waiting_on_client') THEN RETURN NEW; END IF;
  SELECT offering_id INTO v_offering FROM public.fund_setups WHERE id = NEW.setup_id;
  IF v_offering IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notification_events (event_kind, offering_id, field, old_value, new_value, metadata)
  VALUES ('setup_task_progress', v_offering, NEW.label, OLD.status, NEW.status,
    jsonb_build_object('audience','managers','section', NEW.section, 'task_key', NEW.task_key, 'portal_path', '/manager/fund/' || v_offering));
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_fund_setup_task_progress() FROM PUBLIC, anon, authenticated;