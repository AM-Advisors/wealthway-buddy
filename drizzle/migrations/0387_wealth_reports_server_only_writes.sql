-- Published portfolio reports and the portfolio change history are written only by
-- the server after it checks the caller, so neither can be forged through direct writes.
DROP POLICY IF EXISTS wealth_report_versions_owner_insert ON public.wealth_report_versions;
DROP POLICY IF EXISTS wealth_audit_events_actor_insert ON public.wealth_audit_events;
REVOKE INSERT ON public.wealth_report_versions FROM authenticated;
REVOKE INSERT ON public.wealth_audit_events FROM authenticated;