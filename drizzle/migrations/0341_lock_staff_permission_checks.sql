REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_side_letters(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assert_demo_offering(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_side_letters(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_demo_offering(uuid) TO service_role;

-- Signed-in users may only ask about themselves unless they are staff.
CREATE OR REPLACE FUNCTION public.is_platform_admin(_uid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT (auth.role() = 'service_role' OR _uid = auth.uid() OR public.is_any_staff())
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'admin')
$$;