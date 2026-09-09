REVOKE EXECUTE ON FUNCTION public.get_offering_entity_details(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_review_operations() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.review_offering_entity(uuid, text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_entity_reviews() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_offering_entity_details(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_review_operations() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_offering_entity(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_entity_reviews() TO authenticated, service_role;