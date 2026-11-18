CREATE OR REPLACE FUNCTION public.foundation_release_event_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE req record; k text; needed text[];
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Release history is append-only'; END IF;
  IF NEW.action = 'requested' THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = NEW.actor_id AND r.role::text IN ('admin','super_admin')) THEN
      RAISE EXCEPTION 'Only an administrator can request a release';
    END IF;
    needed := CASE NEW.dimension WHEN 'commercial' THEN ARRAY['terms','pricing_policy','verification','delivery_workflow','validation'] ELSE ARRAY['delivery_workflow','validation'] END;
    FOREACH k IN ARRAY needed LOOP
      IF length(trim(coalesce(NEW.evidence->>k, ''))) < 10 THEN RAISE EXCEPTION 'Release evidence is missing: %', k; END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM public.foundation_component_release_events o WHERE o.component = NEW.component AND o.dimension = NEW.dimension AND o.action = 'requested'
      AND NOT EXISTS (SELECT 1 FROM public.foundation_component_release_events x WHERE x.request_id = o.id AND x.action IN ('approved','withdrawn'))) THEN
      RAISE EXCEPTION 'A release request for this component is already open';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = NEW.actor_id AND r.role::text = 'super_admin') AND NEW.action <> 'withdrawn' THEN
    RAISE EXCEPTION 'Only a Super Admin can approve or revoke a release';
  END IF;
  IF NEW.action = 'revoked' THEN
    IF NOT public.foundation_component_released(NEW.component, NEW.dimension) THEN RAISE EXCEPTION 'This component is not released'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO req FROM public.foundation_component_release_events WHERE id = NEW.request_id;
  IF req.id IS NULL OR req.action <> 'requested' OR req.component <> NEW.component OR req.dimension <> NEW.dimension THEN RAISE EXCEPTION 'Release request not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.foundation_component_release_events x WHERE x.request_id = req.id AND x.action IN ('approved','withdrawn')) THEN
    RAISE EXCEPTION 'This release request was already decided';
  END IF;
  IF NEW.action = 'approved' THEN
    -- A Super Admin may approve their own request only with a reasoned self-approval recorded for it (self_approval_overrides).
    IF NEW.actor_id = req.actor_id AND NOT public.sod_override_active(ARRAY[req.id]) THEN
      RAISE EXCEPTION 'Someone other than the requester must approve a release';
    END IF;
    IF NEW.dimension = 'commercial' AND NOT public.foundation_component_released(NEW.component, 'delivery') THEN
      RAISE EXCEPTION 'Release delivery readiness for this component first';
    END IF;
    NEW.evidence := req.evidence;
  ELSIF NEW.action = 'withdrawn' AND NEW.actor_id <> req.actor_id AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = NEW.actor_id AND r.role::text = 'super_admin') THEN
    RAISE EXCEPTION 'Only the requester or a Super Admin can withdraw a release request';
  END IF;
  RETURN NEW;
END $function$;