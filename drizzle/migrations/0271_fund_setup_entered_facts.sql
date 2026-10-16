CREATE OR REPLACE FUNCTION public.fund_setup_entered_facts(p_offering_id uuid)
RETURNS TABLE(has_ein boolean, has_wire boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT
    EXISTS (SELECT 1 FROM private.offering_entity_details e WHERE e.offering_id = p_offering_id AND length(regexp_replace(coalesce(e.ein,''), '\D', '', 'g')) = 9),
    EXISTS (SELECT 1 FROM private.offering_wire_instructions w WHERE w.offering_id = p_offering_id AND coalesce(w.details,'{}'::jsonb) <> '{}'::jsonb);
$$;
REVOKE ALL ON FUNCTION public.fund_setup_entered_facts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fund_setup_entered_facts(uuid) TO service_role;