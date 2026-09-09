REVOKE EXECUTE ON FUNCTION public.can_manage_diligence(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_view_diligence(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_diligence(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_diligence(uuid) TO authenticated;