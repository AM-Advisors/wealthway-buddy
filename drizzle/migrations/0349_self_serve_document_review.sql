ALTER TABLE public.offering_document_versions ADD COLUMN self_serve_review_state text, ADD COLUMN generation_issues jsonb NOT NULL DEFAULT '[]'::jsonb, ADD COLUMN self_serve_review_note text;
ALTER TABLE public.offering_document_versions ADD CONSTRAINT self_serve_review_state_valid CHECK (self_serve_review_state IS NULL OR self_serve_review_state IN ('pending','approved','returned'));
CREATE OR REPLACE FUNCTION public.guard_self_serve_document_review() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE current_v integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.offering_document_versions WHERE offering_document_id = NEW.offering_document_id AND self_serve_review_state IS NOT NULL) THEN NEW.self_serve_review_state := 'pending'; END IF;
    IF NEW.self_serve_review_state IS NOT NULL AND (NEW.self_serve_review_state <> 'pending' OR NEW.approval_status <> 'uploaded_review_required') THEN RAISE EXCEPTION 'Generated drafts require review'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.self_serve_review_state IS NULL THEN RETURN NEW; END IF;
  IF NEW.self_serve_review_state IS NULL OR NEW.file_path IS DISTINCT FROM OLD.file_path OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.version IS DISTINCT FROM OLD.version OR NEW.offering_id IS DISTINCT FROM OLD.offering_id OR NEW.offering_document_id IS DISTINCT FROM OLD.offering_document_id OR NEW.generation_issues IS DISTINCT FROM OLD.generation_issues THEN RAISE EXCEPTION 'Generated version facts are immutable'; END IF;
  IF NEW.self_serve_review_state IS DISTINCT FROM OLD.self_serve_review_state THEN
    IF OLD.self_serve_review_state <> 'pending' OR NEW.self_serve_review_state NOT IN ('approved','returned') THEN RAISE EXCEPTION 'Review is already recorded'; END IF;
    IF NEW.approved_by IS NULL OR NEW.approved_at IS NULL THEN RAISE EXCEPTION 'Recorded reviewer is required'; END IF;
    IF NEW.approved_by = OLD.created_by AND NOT public.sod_override_active(NEW.approved_by) THEN RAISE EXCEPTION 'A different person must review'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.fund_managers WHERE offering_id = OLD.offering_id AND user_id = NEW.approved_by) AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.approved_by AND role::text IN ('admin','super_admin','operations','fund_administration','legal','compliance')) THEN RAISE EXCEPTION 'Reviewer must manage this fund or be authorized staff'; END IF;
    SELECT current_version INTO current_v FROM public.offering_documents WHERE id = OLD.offering_document_id;
    IF current_v IS DISTINCT FROM OLD.version THEN RAISE EXCEPTION 'Review the current version'; END IF;
    IF NEW.self_serve_review_state = 'approved' AND (NEW.approval_status <> 'approved' OR jsonb_array_length(OLD.generation_issues) > 0) THEN RAISE EXCEPTION 'Resolve document issues before approval'; END IF;
    IF NEW.self_serve_review_state = 'returned' AND coalesce(trim(NEW.self_serve_review_note),'') = '' THEN RAISE EXCEPTION 'Give a reason for returning the draft'; END IF;
  ELSIF OLD.self_serve_review_state IN ('approved','returned') AND (NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.self_serve_review_note IS DISTINCT FROM OLD.self_serve_review_note OR NEW.signing_config IS DISTINCT FROM OLD.signing_config) THEN RAISE EXCEPTION 'Reviewed versions are frozen; create a new version'; END IF;
  IF NEW.approval_status = 'approved' AND NEW.self_serve_review_state <> 'approved' THEN RAISE EXCEPTION 'Complete draft review first'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_self_serve_document_review BEFORE INSERT OR UPDATE ON public.offering_document_versions FOR EACH ROW EXECUTE FUNCTION public.guard_self_serve_document_review();
CREATE OR REPLACE FUNCTION public.audit_self_serve_document_review() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.self_serve_review_state IS DISTINCT FROM OLD.self_serve_review_state THEN
    INSERT INTO public.offering_document_events(offering_id,offering_document_id,version,event,actor_user_id,detail) VALUES (NEW.offering_id,NEW.offering_document_id,NEW.version,'generated_document_review',NEW.approved_by,jsonb_build_object('decision',NEW.self_serve_review_state,'note',NEW.self_serve_review_note));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_self_serve_document_review AFTER UPDATE ON public.offering_document_versions FOR EACH ROW EXECUTE FUNCTION public.audit_self_serve_document_review();
CREATE OR REPLACE FUNCTION public.guard_self_serve_document_activation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.active_version IS DISTINCT FROM OLD.active_version AND NEW.active_version IS NOT NULL AND EXISTS(SELECT 1 FROM public.offering_document_versions WHERE offering_document_id = NEW.id AND version = NEW.active_version AND self_serve_review_state IS NOT NULL AND self_serve_review_state <> 'approved') THEN RAISE EXCEPTION 'Approve the generated version before making it available'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_self_serve_document_activation BEFORE UPDATE ON public.offering_documents FOR EACH ROW EXECUTE FUNCTION public.guard_self_serve_document_activation();