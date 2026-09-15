REVOKE EXECUTE ON FUNCTION public.ct_is_staff() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.ct_can_view(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.ct_can_manage(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.ct_is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ct_can_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ct_can_manage(uuid) TO authenticated;