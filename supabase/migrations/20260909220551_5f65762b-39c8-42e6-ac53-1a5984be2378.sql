REVOKE EXECUTE ON FUNCTION public.get_offering_entity_details(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_offering_entity_details(uuid, boolean, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_offering_ss4_file(uuid, text) FROM anon;