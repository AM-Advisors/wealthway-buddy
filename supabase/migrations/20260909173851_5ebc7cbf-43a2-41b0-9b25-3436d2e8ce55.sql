REVOKE ALL ON FUNCTION public.save_bank_link(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_bank_access_token(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_bank_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_bank_link(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_bank_access_token(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_bank_link(uuid) TO authenticated, service_role;