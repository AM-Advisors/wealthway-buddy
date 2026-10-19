ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid,
  ADD COLUMN IF NOT EXISTS closed_reason text;
ALTER TABLE public.offerings ADD CONSTRAINT offerings_lifecycle_status_chk CHECK (lifecycle_status IN ('open','closed'));

CREATE TABLE public.fund_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  action text NOT NULL CHECK (action IN ('closed','reopen_requested','reopen_approved','reopen_rejected')),
  actor_id uuid NOT NULL,
  reason text NOT NULL,
  request_id uuid,
  self_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fund_status_events TO authenticated;
GRANT ALL ON public.fund_status_events TO service_role;
ALTER TABLE public.fund_status_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers and staff read fund status events" ON public.fund_status_events FOR SELECT TO authenticated
  USING (public.is_any_staff() OR EXISTS (SELECT 1 FROM public.fund_managers m WHERE m.offering_id = fund_status_events.offering_id AND m.user_id = auth.uid()));

CREATE TABLE public.fund_reopen_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  requested_by uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fund_reopen_one_pending ON public.fund_reopen_requests(offering_id) WHERE status = 'pending';
GRANT SELECT ON public.fund_reopen_requests TO authenticated;
GRANT ALL ON public.fund_reopen_requests TO service_role;
ALTER TABLE public.fund_reopen_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers and staff read reopen requests" ON public.fund_reopen_requests FOR SELECT TO authenticated
  USING (public.is_any_staff() OR EXISTS (SELECT 1 FROM public.fund_managers m WHERE m.offering_id = fund_reopen_requests.offering_id AND m.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.block_fund_status_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Fund status history is permanent'; END $$;
CREATE TRIGGER fund_status_events_immutable BEFORE UPDATE OR DELETE ON public.fund_status_events FOR EACH ROW EXECUTE FUNCTION public.block_fund_status_event_mutation();

CREATE OR REPLACE FUNCTION public.guard_fund_reopen_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Reopen requests are permanent'; END IF;
  IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'This reopen request is already decided'; END IF;
  IF NEW.offering_id <> OLD.offering_id OR NEW.requested_by <> OLD.requested_by OR NEW.reason <> OLD.reason OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Reopen request details cannot change'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fund_reopen_requests_guard BEFORE UPDATE OR DELETE ON public.fund_reopen_requests FOR EACH ROW EXECUTE FUNCTION public.guard_fund_reopen_request();

-- Status may only change through the functions below.
CREATE OR REPLACE FUNCTION public.guard_offering_lifecycle_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status AND coalesce(current_setting('app.fund_status_change', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Fund open/closed status changes only through Close fund or an approved reopen';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER offerings_lifecycle_guard BEFORE UPDATE ON public.offerings FOR EACH ROW EXECUTE FUNCTION public.guard_offering_lifecycle_change();

-- A closed fund refuses new investments and new invitation links on every path.
CREATE OR REPLACE FUNCTION public.block_new_investment_on_closed_fund() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.offerings o WHERE o.id = NEW.offering_id AND o.lifecycle_status = 'closed') THEN
    RAISE EXCEPTION 'This fund is closed to new investments.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER closed_fund_blocks_onboardings BEFORE INSERT ON public.investor_onboardings FOR EACH ROW EXECUTE FUNCTION public.block_new_investment_on_closed_fund();
CREATE TRIGGER closed_fund_blocks_applications BEFORE INSERT ON public.investor_applications FOR EACH ROW EXECUTE FUNCTION public.block_new_investment_on_closed_fund();
CREATE TRIGGER closed_fund_blocks_invitations BEFORE INSERT ON public.fund_invitations FOR EACH ROW EXECUTE FUNCTION public.block_new_investment_on_closed_fund();
CREATE TRIGGER closed_fund_blocks_links BEFORE INSERT ON public.fund_onboarding_links FOR EACH ROW EXECUTE FUNCTION public.block_new_investment_on_closed_fund();
CREATE TRIGGER closed_fund_blocks_link_starts BEFORE INSERT ON public.fund_onboarding_link_starts FOR EACH ROW EXECUTE FUNCTION public.block_new_investment_on_closed_fund();

-- Server-only (service role) atomic transitions; authority is checked by the caller and re-checked here.
CREATE OR REPLACE FUNCTION public.close_fund(_offering uuid, _actor uuid, _reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF length(trim(coalesce(_reason,''))) < 3 THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF (SELECT lifecycle_status FROM offerings WHERE id = _offering) = 'closed' THEN RAISE EXCEPTION 'This fund is already closed'; END IF;
  PERFORM set_config('app.fund_status_change', 'on', true);
  UPDATE offerings SET lifecycle_status = 'closed', closed_at = now(), closed_by = _actor, closed_reason = trim(_reason) WHERE id = _offering;
  INSERT INTO fund_status_events(offering_id, action, actor_id, reason) VALUES (_offering, 'closed', _actor, trim(_reason));
  PERFORM set_config('app.fund_status_change', '', true);
END $$;

CREATE OR REPLACE FUNCTION public.decide_fund_reopen(_request uuid, _actor uuid, _approve boolean, _reason text, _self_approved boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM fund_reopen_requests WHERE id = _request FOR UPDATE;
  IF r IS NULL OR r.status <> 'pending' THEN RAISE EXCEPTION 'This reopen request is no longer waiting'; END IF;
  IF r.requested_by = _actor AND NOT _self_approved THEN RAISE EXCEPTION 'Someone other than the requester must decide'; END IF;
  IF length(trim(coalesce(_reason,''))) < 3 THEN RAISE EXCEPTION 'A reason is required'; END IF;
  UPDATE fund_reopen_requests SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END, decided_by = _actor, decided_at = now(), decision_reason = trim(_reason) WHERE id = _request;
  IF _approve THEN
    PERFORM set_config('app.fund_status_change', 'on', true);
    UPDATE offerings SET lifecycle_status = 'open' WHERE id = r.offering_id;
    PERFORM set_config('app.fund_status_change', '', true);
  END IF;
  INSERT INTO fund_status_events(offering_id, action, actor_id, reason, request_id, self_approved)
    VALUES (r.offering_id, CASE WHEN _approve THEN 'reopen_approved' ELSE 'reopen_rejected' END, _actor, trim(_reason), _request, _self_approved AND r.requested_by = _actor);
END $$;
REVOKE ALL ON FUNCTION public.close_fund(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_fund_reopen(uuid,uuid,boolean,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_fund(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_fund_reopen(uuid,uuid,boolean,text,boolean) TO service_role;