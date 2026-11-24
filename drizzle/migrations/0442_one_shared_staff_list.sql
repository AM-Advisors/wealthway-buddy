CREATE OR REPLACE FUNCTION public.is_any_staff()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text IN ('admin','super_admin','operations','legal','compliance','fund_administration','tax','finance','client_success','executive','leadership') ) $function$;
COMMENT ON FUNCTION public.is_any_staff() IS 'Who counts as Harmonious staff. Must match STAFF_ROLES in src/lib/staff-roles.ts.';

CREATE OR REPLACE FUNCTION public.is_fund_operations_staff(_uid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT _uid IS NOT NULL AND EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role::text IN ('admin','super_admin','operations','fund_administration','legal','compliance') ) $function$;
COMMENT ON FUNCTION public.is_fund_operations_staff(uuid) IS 'Staff who may act on fund records. Must match FUND_OPERATIONS_ROLES in src/lib/staff-roles.ts.';
REVOKE ALL ON FUNCTION public.is_fund_operations_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_fund_operations_staff(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ct_is_staff()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT auth.uid() IS NOT NULL AND public.is_fund_operations_staff(auth.uid()) $function$;

CREATE OR REPLACE FUNCTION public.guard_self_serve_document_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ DECLARE current_v integer; BEGIN
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
  IF NOT EXISTS (SELECT 1 FROM public.fund_managers WHERE offering_id = OLD.offering_id AND user_id = NEW.approved_by) AND NOT public.is_fund_operations_staff(NEW.approved_by) AND NOT public.is_live_fund_reviewer(NEW.approved_by, OLD.offering_id) THEN RAISE EXCEPTION 'Reviewer must manage this fund or hold exact-fund review authority'; END IF;
  SELECT current_version INTO current_v FROM public.offering_documents WHERE id = OLD.offering_document_id;
  IF current_v IS DISTINCT FROM OLD.version THEN RAISE EXCEPTION 'Review the current version'; END IF;
  IF NEW.self_serve_review_state = 'approved' AND (NEW.approval_status <> 'approved' OR jsonb_array_length(OLD.generation_issues) > 0) THEN RAISE EXCEPTION 'Resolve document issues before approval'; END IF;
  IF NEW.self_serve_review_state = 'returned' AND coalesce(trim(NEW.self_serve_review_note),'') = '' THEN RAISE EXCEPTION 'Give a reason for returning the draft'; END IF;
 ELSIF OLD.self_serve_review_state IN ('approved','returned') AND (NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.self_serve_review_note IS DISTINCT FROM OLD.self_serve_review_note OR NEW.signing_config IS DISTINCT FROM OLD.signing_config) THEN RAISE EXCEPTION 'Reviewed versions are frozen; create a new version'; END IF;
 IF NEW.approval_status = 'approved' AND NEW.self_serve_review_state <> 'approved' THEN RAISE EXCEPTION 'Complete draft review first'; END IF; RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.guard_side_letter_change_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ BEGIN IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Side letter change requests cannot be deleted'; END IF; IF OLD.status<>'pending' THEN RAISE EXCEPTION 'Decided change requests are immutable'; END IF; IF NEW.status IN ('approved','declined') THEN IF NEW.decided_by IS NULL OR NEW.decided_at IS NULL THEN RAISE EXCEPTION 'Record the authorized decision maker'; END IF; IF NOT EXISTS(SELECT 1 FROM public.fund_managers WHERE offering_id=OLD.offering_id AND user_id=NEW.decided_by) AND NOT public.is_fund_operations_staff(NEW.decided_by) AND NOT public.is_live_fund_reviewer(NEW.decided_by,OLD.offering_id) THEN RAISE EXCEPTION 'Only authorized exact-fund reviewers may decide'; END IF; END IF; IF NEW.status='declined' AND coalesce(btrim(NEW.decision_reason),'')='' THEN RAISE EXCEPTION 'A decline reason is required'; END IF; IF NEW.after_snapshot IS DISTINCT FROM OLD.after_snapshot OR NEW.proposed_by IS DISTINCT FROM OLD.proposed_by THEN RAISE EXCEPTION 'Proposal content cannot be changed'; END IF; RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.decide_routine_side_letter(_request uuid, _actor uuid, _decision text, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE r public.side_letter_change_requests%ROWTYPE; l public.side_letters%ROWTYPE; s jsonb; v integer; BEGIN SELECT * INTO r FROM public.side_letter_change_requests WHERE id=_request FOR UPDATE; IF NOT FOUND OR r.status<>'pending' THEN RAISE EXCEPTION 'Proposal is no longer pending'; END IF; IF _decision NOT IN ('approved','declined','withdrawn') THEN RAISE EXCEPTION 'Invalid decision'; END IF; IF _decision='withdrawn' THEN IF r.proposed_by<>_actor THEN RAISE EXCEPTION 'Only proposer may withdraw'; END IF; ELSE IF NOT EXISTS(SELECT 1 FROM public.fund_managers WHERE offering_id=r.offering_id AND user_id=_actor) AND NOT public.is_fund_operations_staff(_actor) AND NOT public.is_live_fund_reviewer(_actor,r.offering_id) THEN RAISE EXCEPTION 'Exact-fund review authority required'; END IF; END IF; SELECT * INTO l FROM public.side_letters WHERE id=r.side_letter_id AND offering_id=r.offering_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Side letter unavailable'; END IF; UPDATE public.side_letter_change_requests SET status=_decision,decided_by=_actor,decided_at=now(),decision_reason=nullif(btrim(_reason),'') WHERE id=r.id; IF _decision='approved' THEN s:=r.after_snapshot; v:=l.current_version+1; INSERT INTO public.side_letter_versions(side_letter_id,version,snapshot,change_request_id) VALUES(l.id,v,s,r.id); UPDATE public.side_letters SET status=CASE WHEN r.kind='terminate' THEN 'terminated' ELSE 'active' END,investor_label=s->>'investorLabel',mfn_enabled=coalesce((s->>'mfnEnabled')::boolean,false),mfn_scope=CASE WHEN coalesce((s->>'mfnEnabled')::boolean,false) THEN s->>'mfnScope' ELSE NULL END,effective_date=nullif(s->>'effectiveDate','')::date,expiry_date=nullif(s->>'expiryDate','')::date,renewal_note=s->>'renewalNote',document_reference=s->>'documentReference',terms=s->'terms',current_version=v,updated_at=now() WHERE id=l.id; ELSIF r.kind='create' THEN UPDATE public.side_letters SET status='declined',updated_at=now() WHERE id=l.id; END IF; INSERT INTO public.side_letter_events(offering_id,side_letter_id,event,actor_id,detail) VALUES(r.offering_id,l.id,_decision||'_'||r.kind,_actor,jsonb_build_object('change_request_id',r.id,'reason',_reason)); END; $function$;

DROP POLICY IF EXISTS "Staff read every intake" ON public.client_fund_intakes;
CREATE POLICY "Staff read every intake" ON public.client_fund_intakes FOR SELECT TO authenticated USING (public.is_any_staff());

DROP POLICY IF EXISTS "Staff can view scheduled job runs" ON public.scheduled_job_runs;
CREATE POLICY "Staff can view scheduled job runs" ON public.scheduled_job_runs FOR SELECT TO authenticated USING (public.is_any_staff());

DROP POLICY IF EXISTS "Staff read cap stakeholders" ON public.cap_stakeholders;
CREATE POLICY "Staff read cap stakeholders" ON public.cap_stakeholders FOR SELECT TO authenticated USING (public.is_any_staff());

DROP POLICY IF EXISTS "Staff read cap holdings" ON public.cap_holdings;
CREATE POLICY "Staff read cap holdings" ON public.cap_holdings FOR SELECT TO authenticated USING (public.is_any_staff());

DROP POLICY IF EXISTS "Staff read cap transfers" ON public.cap_transfers;
CREATE POLICY "Staff read cap transfers" ON public.cap_transfers FOR SELECT TO authenticated USING (public.is_any_staff());

DROP POLICY IF EXISTS "Staff read holder access" ON public.cap_holder_access;
CREATE POLICY "Staff read holder access" ON public.cap_holder_access FOR SELECT TO authenticated USING (public.is_any_staff());

DROP POLICY IF EXISTS "Staff read certificates" ON public.cap_certificates;
CREATE POLICY "Staff read certificates" ON public.cap_certificates FOR SELECT TO authenticated USING (public.is_any_staff());

DROP POLICY IF EXISTS "Staff read cap onboarding" ON public.cap_onboarding;
CREATE POLICY "Staff read cap onboarding" ON public.cap_onboarding FOR SELECT TO authenticated USING (public.is_any_staff());

DROP POLICY IF EXISTS "Staff read certificate files" ON storage.objects;
CREATE POLICY "Staff read certificate files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'cap-certificates' AND public.is_any_staff());