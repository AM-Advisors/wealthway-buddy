-- Portfolio history is owner-read, server-written and append-only. Remove
-- privileges no policy or workflow uses, so access does not rest on RLS alone.
REVOKE ALL ON public.wealth_report_versions FROM anon;
REVOKE ALL ON public.wealth_portfolio_records FROM anon;
REVOKE ALL ON public.wealth_audit_events FROM anon;
REVOKE ALL ON public.wealth_import_batches FROM anon;
REVOKE ALL ON public.personal_wealth_observations FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.wealth_report_versions FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.wealth_portfolio_records FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.wealth_audit_events FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.wealth_import_batches FROM authenticated;
GRANT ALL ON public.wealth_report_versions, public.wealth_portfolio_records, public.wealth_audit_events, public.wealth_import_batches TO service_role;