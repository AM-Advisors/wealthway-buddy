CREATE OR REPLACE FUNCTION public.is_client_member(_client_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.client_users WHERE user_id = auth.uid() AND client_id = _client_id AND revoked_at IS NULL)
$function$;

CREATE OR REPLACE FUNCTION public.ct_can_manage(_company_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.ct_companies c
    WHERE c.id = _company_id AND NOT c.is_demo
      AND (public.ct_is_staff() OR EXISTS (
        SELECT 1 FROM public.client_users cu
        WHERE cu.client_id = c.client_id AND cu.user_id = auth.uid()
          AND cu.client_role <> 'client_readonly' AND cu.revoked_at IS NULL)));
$function$;

CREATE OR REPLACE FUNCTION public.ct_can_view(_company_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.ct_companies c
    WHERE c.id = _company_id
      AND (c.is_demo OR public.ct_is_staff() OR EXISTS (
        SELECT 1 FROM public.client_users cu
        WHERE cu.client_id = c.client_id AND cu.user_id = auth.uid() AND cu.revoked_at IS NULL)));
$function$;

CREATE OR REPLACE FUNCTION private.client_visible(_user_id uuid, _client_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT private.is_staff(_user_id)
     OR EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = _client_id AND cu.user_id = _user_id AND cu.revoked_at IS NULL)
     OR EXISTS (
          SELECT 1 FROM public.fund_managers fm
          JOIN public.offerings o ON o.id = fm.offering_id
          WHERE fm.user_id = _user_id AND o.client_id = _client_id)
$function$;

-- Policies on other tables look up client_users through its own read rule, so a removed row no longer counts there.
DROP POLICY IF EXISTS "client users readable" ON public.client_users;
CREATE POLICY "client users readable" ON public.client_users FOR SELECT TO authenticated
  USING ((user_id = auth.uid() AND revoked_at IS NULL) OR private.client_visible(auth.uid(), client_id));

DO $do$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'sign_client_msa';
  n := replace(d, 'WHERE client_id = p_client_id AND user_id = actor)', 'WHERE client_id = p_client_id AND user_id = actor AND revoked_at IS NULL)');
  IF n = d THEN RAISE EXCEPTION 'sign_client_msa membership check not found'; END IF;
  EXECUTE n;
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'client_create_wire_request';
  n := regexp_replace(d, 'WHERE cu\.client_id = _client_id AND cu\.user_id = auth\.uid\(\)', 'WHERE cu.client_id = _client_id AND cu.user_id = auth.uid() AND cu.revoked_at IS NULL');
  IF n = d THEN RAISE EXCEPTION 'client_create_wire_request membership check not found'; END IF;
  EXECUTE n;
END
$do$;