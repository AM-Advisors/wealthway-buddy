CREATE OR REPLACE FUNCTION public.fund_request_task_team(_team text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
 SELECT CASE WHEN _team IN ('capital_operations','investor_operations','entity_operations','reporting','operations') THEN 'operations' WHEN _team IN ('fund_accounting','treasury','tax') THEN 'finance' WHEN _team='account_management' THEN 'sales' WHEN _team='compliance' THEN 'compliance' ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.fund_request_task_team(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fund_request_task_team(text) TO service_role;
CREATE OR REPLACE FUNCTION public.sync_fund_request_task_routing() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.staff_tasks; r public.fund_service_requests; mapped text;
BEGIN
 IF pg_trigger_depth()>1 THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='fund_service_requests' THEN
  IF NEW.task_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.task_id IS NOT DISTINCT FROM OLD.task_id AND ROW(NEW.assigned_to,NEW.assigned_team,NEW.due_date) IS NOT DISTINCT FROM ROW(OLD.assigned_to,OLD.assigned_team,OLD.due_date) THEN RETURN NEW; END IF;
  SELECT * INTO t FROM public.staff_tasks WHERE id=NEW.task_id FOR UPDATE;
  IF t.offering_id IS DISTINCT FROM NEW.fund_id OR t.related_workflow_type IS DISTINCT FROM 'fund_service_request' OR t.related_workflow_id IS DISTINCT FROM NEW.id OR t.source_ref IS DISTINCT FROM 'fund_request:'||NEW.id::text THEN RAISE EXCEPTION 'Request task link does not match'; END IF;
  IF EXISTS(SELECT 1 FROM public.fund_service_requests WHERE task_id=NEW.task_id AND id<>NEW.id) THEN RAISE EXCEPTION 'Task already linked to another request'; END IF;
  mapped:=public.fund_request_task_team(NEW.assigned_team);
  IF NEW.assigned_team IS NOT NULL AND mapped IS NULL THEN RAISE EXCEPTION 'Unknown request team'; END IF;
  IF ROW(t.assignee_user_id,t.team,t.due_date) IS DISTINCT FROM ROW(NEW.assigned_to,mapped,NEW.due_date) THEN
   UPDATE public.staff_tasks SET assignee_user_id=NEW.assigned_to,team=mapped,due_date=NEW.due_date,updated_at=now() WHERE id=t.id;
   INSERT INTO public.staff_task_events(task_id,actor_user_id,kind,detail) VALUES(t.id,NULL,'request_routing_sync',jsonb_build_object('request_id',NEW.id,'from',jsonb_build_object('owner',t.assignee_user_id,'team',t.team,'due',t.due_date),'to',jsonb_build_object('owner',NEW.assigned_to,'team',mapped,'due',NEW.due_date)));
  END IF;
 ELSE
  IF ROW(NEW.assignee_user_id,NEW.team,NEW.due_date) IS NOT DISTINCT FROM ROW(OLD.assignee_user_id,OLD.team,OLD.due_date) THEN RETURN NEW; END IF;
  SELECT * INTO r FROM public.fund_service_requests WHERE task_id=NEW.id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NEW.offering_id IS DISTINCT FROM r.fund_id OR NEW.related_workflow_type IS DISTINCT FROM 'fund_service_request' OR NEW.related_workflow_id IS DISTINCT FROM r.id OR NEW.source_ref IS DISTINCT FROM 'fund_request:'||r.id::text THEN RAISE EXCEPTION 'Request task link does not match'; END IF;
  mapped:=r.assigned_team;
  IF NEW.team IS DISTINCT FROM OLD.team THEN
   IF NEW.team IS NOT DISTINCT FROM public.fund_request_task_team(r.assigned_team) THEN mapped:=r.assigned_team;
   ELSE mapped:=CASE NEW.team WHEN 'operations' THEN 'operations' WHEN 'finance' THEN 'fund_accounting' WHEN 'sales' THEN 'account_management' WHEN 'compliance' THEN 'compliance' ELSE NULL END;
    IF NEW.team IS NOT NULL AND mapped IS NULL THEN RAISE EXCEPTION 'This team cannot receive fund requests'; END IF;
   END IF;
  END IF;
  IF ROW(r.assigned_to,r.assigned_team,r.due_date) IS DISTINCT FROM ROW(NEW.assignee_user_id,mapped,NEW.due_date) THEN
   UPDATE public.fund_service_requests SET assigned_to=NEW.assignee_user_id,assigned_team=mapped,due_date=NEW.due_date,updated_at=now() WHERE id=r.id;
   INSERT INTO public.fund_request_events(request_id,fund_id,actor_user_id,kind,client_visible,detail) VALUES(r.id,r.fund_id,NULL,'task_routing_sync',false,jsonb_build_object('task_id',NEW.id,'from',jsonb_build_object('owner',r.assigned_to,'team',r.assigned_team,'due',r.due_date),'to',jsonb_build_object('owner',NEW.assignee_user_id,'team',mapped,'due',NEW.due_date)));
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_fund_request_task_routing() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_fund_request_task_routing() TO service_role;
CREATE TRIGGER fund_request_task_routing_sync AFTER UPDATE OF task_id,assigned_to,assigned_team,due_date ON public.fund_service_requests FOR EACH ROW EXECUTE FUNCTION public.sync_fund_request_task_routing();
CREATE TRIGGER task_fund_request_routing_sync AFTER UPDATE OF assignee_user_id,team,due_date ON public.staff_tasks FOR EACH ROW EXECUTE FUNCTION public.sync_fund_request_task_routing();