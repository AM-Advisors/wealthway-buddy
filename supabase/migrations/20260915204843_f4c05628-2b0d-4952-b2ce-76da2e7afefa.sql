REVOKE EXECUTE ON FUNCTION public.cap_holder_can_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cap_holder_can_view(uuid) TO authenticated;