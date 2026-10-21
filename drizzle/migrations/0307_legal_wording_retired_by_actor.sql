CREATE OR REPLACE FUNCTION public.log_legal_wording_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ev text; who uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN ev := 'drafted'; who := NEW.created_by;
    IF NEW.status = 'approved' THEN
      INSERT INTO legal_wording_events (wording_version_id, requirement_key, version, event, actor_user_id, wording_snapshot, title_snapshot, effective_date)
      VALUES (NEW.id, NEW.requirement_key, NEW.version, 'drafted', NEW.created_by, NEW.wording, NEW.title, NEW.effective_date);
      ev := 'approved'; who := NEW.approved_by;
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    ev := NEW.status; who := CASE WHEN NEW.status = 'approved' THEN NEW.approved_by ELSE NEW.retired_by END;
  ELSE RETURN NEW; END IF;
  INSERT INTO legal_wording_events (wording_version_id, requirement_key, version, event, actor_user_id, wording_snapshot, title_snapshot, effective_date)
  VALUES (NEW.id, NEW.requirement_key, NEW.version, ev, who, NEW.wording, NEW.title, NEW.effective_date);
  RETURN NEW;
END $$;