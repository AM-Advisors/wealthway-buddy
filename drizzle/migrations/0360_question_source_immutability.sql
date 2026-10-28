CREATE OR REPLACE FUNCTION public.guard_fund_questionnaire_section() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN
  IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'Approved question sections are kept; retire them instead.'; END IF;
  RETURN OLD;
 END IF;
 IF OLD.status <> 'draft' THEN
  IF NEW.questions IS DISTINCT FROM OLD.questions OR NEW.title IS DISTINCT FROM OLD.title OR NEW.source_note IS DISTINCT FROM OLD.source_note OR NEW.source_documents IS DISTINCT FROM OLD.source_documents OR NEW.prepared_by IS DISTINCT FROM OLD.prepared_by OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NOT (OLD.status = 'approved' AND NEW.status = 'retired') THEN
   RAISE EXCEPTION 'Approved question sections cannot be changed; create a new version.';
  END IF;
 END IF;
 IF NEW.status = 'approved' AND OLD.status = 'draft' AND NEW.approved_by IS NULL THEN
  RAISE EXCEPTION 'Approval needs a reviewer.';
 END IF;
 RETURN NEW;
END $$;