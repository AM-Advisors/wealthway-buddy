CREATE TABLE public.software_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.staff_tasks(id),
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 200),
  expected text NOT NULL,
  actual text NOT NULL,
  steps text NOT NULL,
  impact text NOT NULL,
  page text,
  occurred_at timestamptz,
  record_ref text,
  reporter_user_id uuid NOT NULL,
  technical_owner_user_id uuid NOT NULL,
  retester_user_id uuid NOT NULL,
  stage text NOT NULL DEFAULT 'reported' CHECK (stage IN ('reported','in_progress','fixed','deployed','retest_passed','retest_failed','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.software_issues TO service_role;
ALTER TABLE public.software_issues ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.software_issue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.software_issues(id),
  actor_user_id uuid NOT NULL,
  from_stage text,
  to_stage text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.software_issue_events TO service_role;
ALTER TABLE public.software_issue_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER software_issue_events_append_only BEFORE UPDATE OR DELETE ON public.software_issue_events FOR EACH ROW EXECUTE FUNCTION public.block_sealed_record_mutation();

CREATE OR REPLACE FUNCTION public.software_issue_report(_actor uuid, _p jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE iid uuid; tid uuid;
BEGIN
  INSERT INTO public.staff_tasks (title, description, priority, team, assignee_user_id, created_by, source, related_workflow_type)
  VALUES (left('Software issue: ' || (_p->>'title'), 300), 'See the software issue for details.', COALESCE(_p->>'priority','normal'), 'operations', (_p->>'owner')::uuid, _actor, 'workflow', 'software_issue')
  RETURNING id INTO tid;
  INSERT INTO public.software_issues (task_id, title, expected, actual, steps, impact, page, occurred_at, record_ref, reporter_user_id, technical_owner_user_id, retester_user_id)
  VALUES (tid, _p->>'title', _p->>'expected', _p->>'actual', _p->>'steps', _p->>'impact', NULLIF(_p->>'page',''), NULLIF(_p->>'occurredAt','')::timestamptz, NULLIF(_p->>'recordRef',''), _actor, (_p->>'owner')::uuid, (_p->>'retester')::uuid)
  RETURNING id INTO iid;
  UPDATE public.staff_tasks SET related_workflow_id = iid WHERE id = tid;
  INSERT INTO public.software_issue_events (issue_id, actor_user_id, from_stage, to_stage) VALUES (iid, _actor, NULL, 'reported');
  INSERT INTO public.staff_task_events (task_id, actor_user_id, kind, detail) VALUES (tid, _actor, 'created', jsonb_build_object('software_issue', iid));
  RETURN iid;
END $$;

CREATE OR REPLACE FUNCTION public.software_issue_move(_issue uuid, _actor uuid, _to text, _note text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.software_issues%ROWTYPE; ok boolean := false;
BEGIN
  SELECT * INTO i FROM public.software_issues WHERE id = _issue FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Issue not found.'; END IF;
  IF _to IN ('in_progress','fixed','deployed') THEN
    IF _actor IS DISTINCT FROM i.technical_owner_user_id THEN RAISE EXCEPTION 'Only the technical owner can move the fix forward.'; END IF;
    ok := (i.stage IN ('reported','retest_failed') AND _to = 'in_progress') OR (i.stage = 'in_progress' AND _to = 'fixed') OR (i.stage = 'fixed' AND _to = 'deployed');
  ELSIF _to IN ('retest_passed','retest_failed') THEN
    IF _actor IS DISTINCT FROM i.retester_user_id THEN RAISE EXCEPTION 'Only the named retester can record the retest.'; END IF;
    ok := i.stage = 'deployed';
    IF _to = 'retest_failed' AND NULLIF(trim(COALESCE(_note,'')),'') IS NULL THEN RAISE EXCEPTION 'Describe what still fails.'; END IF;
  ELSIF _to = 'resolved' THEN
    IF _actor IS DISTINCT FROM i.retester_user_id AND _actor IS DISTINCT FROM i.technical_owner_user_id THEN RAISE EXCEPTION 'Only the technical owner or retester can resolve this issue.'; END IF;
    ok := i.stage = 'retest_passed';
  END IF;
  IF NOT ok THEN RAISE EXCEPTION 'That step is not available from the current stage.'; END IF;
  UPDATE public.software_issues SET stage = _to, updated_at = now() WHERE id = _issue;
  INSERT INTO public.software_issue_events (issue_id, actor_user_id, from_stage, to_stage, note) VALUES (_issue, _actor, i.stage, _to, left(_note, 4000));
  IF _to = 'resolved' AND i.task_id IS NOT NULL THEN
    UPDATE public.staff_tasks SET status = 'done', completed_at = now(), completion_note = 'Software issue resolved after a passed retest.', updated_at = now() WHERE id = i.task_id AND status NOT IN ('done','cancelled');
    INSERT INTO public.staff_task_events (task_id, actor_user_id, kind, detail) VALUES (i.task_id, _actor, 'completed', jsonb_build_object('software_issue', _issue));
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.software_issue_report(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.software_issue_move(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.software_issue_report(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.software_issue_move(uuid, uuid, text, text) TO service_role;