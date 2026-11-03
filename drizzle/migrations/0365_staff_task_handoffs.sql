ALTER TABLE public.staff_tasks
  ADD COLUMN IF NOT EXISTS handoff_to_user_id uuid,
  ADD COLUMN IF NOT EXISTS handoff_from_user_id uuid,
  ADD COLUMN IF NOT EXISTS handoff_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS handoff_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS handoff_issue text,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS completion_note text,
  ADD COLUMN IF NOT EXISTS completion_ref text;

CREATE INDEX IF NOT EXISTS staff_tasks_handoff_to_idx ON public.staff_tasks (handoff_to_user_id) WHERE handoff_to_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.staff_task_transition(_task uuid, _actor uuid, _action text, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.staff_tasks%ROWTYPE;
  owner uuid;
  txt text;
BEGIN
  SELECT * INTO t FROM public.staff_tasks WHERE id = _task FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found.'; END IF;
  owner := COALESCE(t.assignee_user_id, t.created_by);
  IF t.status IN ('done','cancelled') AND _action <> 'reopen' THEN RAISE EXCEPTION 'This task is already closed.'; END IF;

  IF _action = 'request_handoff' THEN
    IF _actor IS DISTINCT FROM owner THEN RAISE EXCEPTION 'Only the accountable owner can hand this task off.'; END IF;
    IF (_payload->>'to') IS NULL OR (_payload->>'to')::uuid = _actor THEN RAISE EXCEPTION 'Choose who should receive this task.'; END IF;
    UPDATE public.staff_tasks SET handoff_to_user_id = (_payload->>'to')::uuid, handoff_from_user_id = _actor, handoff_requested_at = now(),
      handoff_accepted_at = NULL, handoff_issue = NULL, next_action = COALESCE(NULLIF(trim(_payload->>'nextAction'),''), next_action), updated_at = now()
      WHERE id = _task;
    INSERT INTO public.staff_task_events (task_id, actor_user_id, kind, detail) VALUES (_task, _actor, 'handoff_requested', jsonb_build_object('to', _payload->>'to', 'nextAction', _payload->>'nextAction'));

  ELSIF _action = 'accept_handoff' THEN
    IF t.handoff_to_user_id IS DISTINCT FROM _actor THEN RAISE EXCEPTION 'Only the person receiving this handoff can accept it.'; END IF;
    UPDATE public.staff_tasks SET assignee_user_id = _actor, handoff_to_user_id = NULL, handoff_accepted_at = now(), handoff_issue = NULL, updated_at = now() WHERE id = _task;
    INSERT INTO public.staff_task_events (task_id, actor_user_id, kind, detail) VALUES (_task, _actor, 'handoff_accepted', jsonb_build_object('from', t.handoff_from_user_id));

  ELSIF _action = 'handoff_issue' THEN
    IF t.handoff_to_user_id IS DISTINCT FROM _actor THEN RAISE EXCEPTION 'Only the person receiving this handoff can report what is missing.'; END IF;
    txt := NULLIF(trim(_payload->>'text'), '');
    IF txt IS NULL THEN RAISE EXCEPTION 'Describe what is missing.'; END IF;
    UPDATE public.staff_tasks SET handoff_issue = left(txt, 2000), updated_at = now() WHERE id = _task;
    INSERT INTO public.staff_task_events (task_id, actor_user_id, kind, detail) VALUES (_task, _actor, 'handoff_issue', jsonb_build_object('text', left(txt, 2000)));

  ELSIF _action = 'cancel_handoff' THEN
    IF _actor IS DISTINCT FROM owner OR t.handoff_to_user_id IS NULL THEN RAISE EXCEPTION 'Only the accountable owner can withdraw a pending handoff.'; END IF;
    UPDATE public.staff_tasks SET handoff_to_user_id = NULL, handoff_requested_at = NULL, handoff_issue = NULL, updated_at = now() WHERE id = _task;
    INSERT INTO public.staff_task_events (task_id, actor_user_id, kind, detail) VALUES (_task, _actor, 'handoff_withdrawn', jsonb_build_object('to', t.handoff_to_user_id));

  ELSIF _action = 'block' THEN
    IF _actor IS DISTINCT FROM owner THEN RAISE EXCEPTION 'Only the accountable owner can mark this task blocked.'; END IF;
    IF NULLIF(trim(_payload->>'nextAction'),'') IS NULL OR (_payload->>'targetDate') IS NULL OR (_payload->>'followUp') IS NULL THEN
      RAISE EXCEPTION 'A blocked task needs a next action, target date and follow-up date.';
    END IF;
    UPDATE public.staff_tasks SET status = 'blocked', next_action = left(trim(_payload->>'nextAction'), 1000), due_date = (_payload->>'targetDate')::date,
      follow_up_date = (_payload->>'followUp')::date, waiting_since = COALESCE(waiting_since, now()), updated_at = now() WHERE id = _task;
    INSERT INTO public.staff_task_events (task_id, actor_user_id, kind, detail) VALUES (_task, _actor, 'blocked', _payload - 'unused');

  ELSIF _action = 'set_next' THEN
    IF _actor IS DISTINCT FROM owner THEN RAISE EXCEPTION 'Only the accountable owner can update the next step.'; END IF;
    UPDATE public.staff_tasks SET next_action = NULLIF(left(trim(COALESCE(_payload->>'nextAction','')), 1000), ''),
      follow_up_date = COALESCE((_payload->>'followUp')::date, follow_up_date),
      status = CASE WHEN t.status = 'blocked' AND (_payload->>'unblock')::boolean IS TRUE THEN 'in_progress' ELSE t.status END,
      updated_at = now() WHERE id = _task;
    INSERT INTO public.staff_task_events (task_id, actor_user_id, kind, detail) VALUES (_task, _actor, 'next_step', _payload);

  ELSIF _action = 'complete' THEN
    IF _actor IS DISTINCT FROM owner THEN RAISE EXCEPTION 'Only the accountable owner can complete this task.'; END IF;
    IF t.handoff_to_user_id IS NOT NULL THEN RAISE EXCEPTION 'Withdraw or finish the pending handoff first.'; END IF;
    txt := NULLIF(trim(_payload->>'note'), '');
    IF txt IS NULL THEN RAISE EXCEPTION 'Add a short note about what was done.'; END IF;
    UPDATE public.staff_tasks SET status = 'done', completed_at = now(), completion_note = left(txt, 4000),
      completion_ref = NULLIF(left(trim(COALESCE(_payload->>'ref','')), 500), ''), updated_at = now() WHERE id = _task;
    INSERT INTO public.staff_task_events (task_id, actor_user_id, kind, detail) VALUES (_task, _actor, 'completed', jsonb_build_object('note', left(txt, 4000), 'ref', _payload->>'ref'));

  ELSE
    RAISE EXCEPTION 'Unknown task action.';
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.staff_task_transition(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_task_transition(uuid, uuid, text, jsonb) TO service_role;