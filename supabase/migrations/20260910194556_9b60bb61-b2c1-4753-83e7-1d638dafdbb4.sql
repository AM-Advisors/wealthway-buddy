CREATE OR REPLACE FUNCTION private.grantable_staff_role(_role public.app_role)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT _role::text IN ('admin','operations','legal','compliance','fund_administration',
                         'tax','finance','client_success','executive')
$$;

REVOKE ALL ON FUNCTION public.list_staff_accounts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_staff_role(uuid, public.app_role, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_staff_accounts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_role(uuid, public.app_role, boolean) TO authenticated;