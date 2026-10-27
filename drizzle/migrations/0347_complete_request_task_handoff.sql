CREATE OR REPLACE FUNCTION public.fund_request_task_team(_team text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
 SELECT CASE WHEN _team IN ('capital_operations','investor_operations','entity_operations','reporting','operations') THEN 'operations' WHEN _team IN ('fund_accounting','treasury','tax') THEN 'finance' WHEN _team IN ('sales','account_management') THEN 'sales' WHEN _team='compliance' THEN 'compliance' ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.fund_request_task_team(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fund_request_task_team(text) TO service_role;
CREATE OR REPLACE FUNCTION public.sync_fund_request_task_progress() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.staff_tasks; next_status text;
BEGIN
 IF NEW.task_id IS NULL THEN RETURN NEW; END IF;
 IF NEW.task_id IS NOT DISTINCT FROM OLD.task_id AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 SELECT * INTO t FROM public.staff_tasks WHERE id=NEW.task_id FOR UPDATE;
 IF NOT FOUND OR t.offering_id IS DISTINCT FROM NEW.fund_id OR t.related_workflow_type IS DISTINCT FROM 'fund_service_request' OR t.related_workflow_id IS DISTINCT FROM NEW.id OR t.source_ref IS DISTINCT FROM 'fund_request:'||NEW.id::text THEN RAISE EXCEPTION 'Request task link does not match'; END IF;
 next_status:=CASE WHEN NEW.status='COMPLETED' THEN 'done' WHEN NEW.status='CANCELLED' THEN 'cancelled' WHEN NEW.status IN ('DRAFT','SUBMITTED') THEN 'open' ELSE 'in_progress' END;
 UPDATE public.staff_tasks SET status=next_status,responsibility_status=NEW.responsibility_status,responsibility_manual=false,completed_at=CASE WHEN next_status IN ('done','cancelled') THEN COALESCE(NEW.completed_at,now()) ELSE NULL END,information_request_type=CASE WHEN NEW.status='WAITING_ON_CLIENT' THEN NEW.request_type ELSE NULL END,requested_information=CASE WHEN NEW.status='WAITING_ON_CLIENT' THEN NEW.client_notes ELSE NULL END,updated_at=now() WHERE id=t.id;
 IF t.status IS DISTINCT FROM next_status THEN INSERT INTO public.staff_task_events(task_id,actor_user_id,kind,detail) VALUES(t.id,NULL,'request_progress_sync',jsonb_build_object('request_id',NEW.id,'from',t.status,'to',next_status)); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_fund_request_task_progress() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_fund_request_task_progress() TO service_role;
CREATE TRIGGER fund_request_task_progress_sync AFTER UPDATE OF task_id,status ON public.fund_service_requests FOR EACH ROW EXECUTE FUNCTION public.sync_fund_request_task_progress();