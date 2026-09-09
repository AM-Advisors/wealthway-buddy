REVOKE EXECUTE ON FUNCTION public.diligence_doc_allowed(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.diligence_cap_table_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.diligence_doc_allowed(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.diligence_cap_table_visible(uuid) TO authenticated, service_role;