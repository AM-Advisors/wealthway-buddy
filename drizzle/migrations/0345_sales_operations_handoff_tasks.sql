CREATE OR REPLACE FUNCTION public.guard_sales_handoff_task() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actor uuid;
BEGIN
 IF NEW.source <> 'workflow' OR NEW.source_ref NOT LIKE 'sales-handoff:%' THEN RETURN NEW; END IF;
 IF TG_OP = 'UPDATE' THEN
   actor := nullif(current_setting('app.sales_handoff_actor',true),'')::uuid;
   IF actor IS NULL THEN RAISE EXCEPTION 'Update this handoff on the fund page'; END IF;
   IF NEW.source_ref IS DISTINCT FROM OLD.source_ref OR NEW.offering_id IS DISTINCT FROM OLD.offering_id OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'Handoff source is immutable'; END IF;
 ELSE actor := NEW.created_by;
 END IF;
 IF NEW.status IN ('in_progress','done') AND (NEW.assignee_user_id IS NULL OR NEW.due_date IS NULL) THEN RAISE EXCEPTION 'Assign a receiving owner and due date first'; END IF;
 INSERT INTO public.staff_task_events(task_id,actor_user_id,kind,detail) VALUES(NEW.id,actor,'sales_handoff',jsonb_build_object('status',NEW.status,'owner',NEW.assignee_user_id,'due_date',NEW.due_date));
 RETURN NEW;
END $$;
CREATE TRIGGER sales_handoff_task_guard AFTER INSERT OR UPDATE ON public.staff_tasks FOR EACH ROW EXECUTE FUNCTION public.guard_sales_handoff_task();

CREATE OR REPLACE FUNCTION public.save_sales_operations_handoff(_actor uuid,_quote uuid,_fund uuid,_action text,_owner uuid DEFAULT NULL,_due date DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.sales_quotes; t public.staff_tasks; tid uuid; actor_ops boolean; actor_sales boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_actor AND role::text IN ('super_admin','admin','operations','fund_administration','account_manager','sales','account_executive','bdr','sales_management','cro','executive')) THEN RAISE EXCEPTION 'Staff access required'; END IF;
 IF EXISTS(SELECT 1 FROM public.offerings WHERE id=_fund AND consolidated_into IS NOT NULL) THEN RAISE EXCEPTION 'Retired fund'; END IF;
 SELECT * INTO q FROM public.sales_quotes WHERE id=_quote AND status='signed' AND onboarded_offering_id=_fund;
 IF q.id IS NULL THEN RAISE EXCEPTION 'Signed quote handoff not found'; END IF;
 actor_ops := EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_actor AND role::text IN ('super_admin','admin','operations','fund_administration'));
 actor_sales := q.owner_user_id=_actor OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_actor AND role::text IN ('super_admin','executive','cro')) OR EXISTS(WITH RECURSIVE reports AS (SELECT _actor AS id UNION SELECT l.user_id FROM public.sales_reporting_lines l JOIN reports r ON l.manager_user_id=r.id) SELECT 1 FROM reports WHERE id=q.owner_user_id);
 IF NOT actor_ops AND NOT actor_sales THEN RAISE EXCEPTION 'Handoff outside your Sales scope'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sales-handoff:'||_quote::text,0));
 INSERT INTO public.staff_tasks(title,source,source_ref,team,client_id,offering_id,created_by,related_workflow_type,related_workflow_id) VALUES('Sales to Operations handoff','workflow','sales-handoff:'||_quote::text,'operations',q.client_id,_fund,q.owner_user_id,'sales_handoff',_quote) ON CONFLICT(source,source_ref) WHERE source_ref IS NOT NULL DO NOTHING;
 SELECT * INTO t FROM public.staff_tasks WHERE source='workflow' AND source_ref='sales-handoff:'||_quote::text FOR UPDATE;
 tid := t.id;
 PERFORM set_config('app.sales_handoff_actor',_actor::text,true);
 IF _action='assign' THEN
   IF t.status IN ('done','cancelled') THEN RAISE EXCEPTION 'Completed handoff is retained'; END IF;
   IF _owner IS NULL OR _due IS NULL THEN RAISE EXCEPTION 'Receiving owner and due date required'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_owner AND role::text IN ('admin','operations','fund_administration')) THEN RAISE EXCEPTION 'Choose an Operations owner'; END IF;
   UPDATE public.staff_tasks SET assignee_user_id=_owner,due_date=_due,status=CASE WHEN assignee_user_id IS DISTINCT FROM _owner THEN 'open' ELSE status END,updated_at=now() WHERE id=tid;
 ELSIF _action='acknowledge' THEN
   IF NOT actor_ops OR t.assignee_user_id IS DISTINCT FROM _actor THEN RAISE EXCEPTION 'Only the receiving Operations owner can acknowledge'; END IF;
   IF t.status <> 'open' THEN RAISE EXCEPTION 'Handoff must be awaiting acknowledgment'; END IF;
   UPDATE public.staff_tasks SET status='in_progress',updated_at=now() WHERE id=tid;
 ELSIF _action='complete' THEN
   IF NOT actor_ops OR t.assignee_user_id IS DISTINCT FROM _actor THEN RAISE EXCEPTION 'Only the receiving Operations owner can complete'; END IF;
   IF t.status <> 'in_progress' THEN RAISE EXCEPTION 'Acknowledge the handoff first'; END IF;
   UPDATE public.staff_tasks SET status='done',completed_at=now(),updated_at=now() WHERE id=tid;
 ELSE RAISE EXCEPTION 'Unknown handoff action'; END IF;
 RETURN tid;
END $$;
REVOKE ALL ON FUNCTION public.save_sales_operations_handoff(uuid,uuid,uuid,text,uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_sales_operations_handoff(uuid,uuid,uuid,text,uuid,date) TO service_role;