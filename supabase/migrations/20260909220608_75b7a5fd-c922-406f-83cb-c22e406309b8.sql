REVOKE EXECUTE ON FUNCTION public.get_offering_entity_details(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_offering_entity_details(uuid, boolean, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_offering_ss4_file(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_offering_entity_details(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_offering_entity_details(uuid, boolean, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_offering_ss4_file(uuid, text) TO authenticated, service_role;