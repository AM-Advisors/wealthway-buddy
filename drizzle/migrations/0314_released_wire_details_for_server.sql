CREATE OR REPLACE FUNCTION public.released_wire_details(p_offering_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT v.details FROM private.offering_bank_instruction_versions v
  WHERE v.offering_id = p_offering_id
    AND v.version = (SELECT MAX(x.version) FROM private.offering_bank_instruction_versions x WHERE x.offering_id = p_offering_id)
    AND v.status = 'verified' AND v.ownership_review <> 'review_required'
    AND COALESCE((public.offering_wire_release_state(p_offering_id)->>'available')::boolean, false);
$$;
REVOKE ALL ON FUNCTION public.released_wire_details(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.released_wire_details(uuid) TO service_role;