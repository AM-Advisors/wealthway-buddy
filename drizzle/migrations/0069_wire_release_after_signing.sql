REVOKE EXECUTE ON FUNCTION public.list_bank_instruction_versions(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.review_bank_instruction_version(uuid, integer, text, text, text, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_bank_instruction_versions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_bank_instruction_version(uuid, integer, text, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_wire_instructions(p_offering_id uuid)
 RETURNS TABLE(offering_id uuid, details jsonb, updated_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_read_wire_instructions(p_offering_id) THEN
    RAISE EXCEPTION 'Not authorized to read wire instructions';
  END IF;
  IF private.has_role(auth.uid(), 'admin'::public.app_role)
     OR EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = p_offering_id AND fm.user_id = auth.uid()) THEN
    RETURN QUERY SELECT w.offering_id, w.details, w.updated_at FROM private.offering_wire_instructions w WHERE w.offering_id = p_offering_id;
    RETURN;
  END IF;
  -- Investors: only once their subscription documents are complete (funding-instruction release).
  IF NOT EXISTS (
    SELECT 1 FROM public.investor_applications a
     WHERE a.offering_id = p_offering_id AND a.user_id = auth.uid()
       AND (a.documents_status::text = 'approved' OR a.status::text IN ('funded','closed'))
  ) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT v.offering_id, v.details, v.verified_at
    FROM private.offering_bank_instruction_versions v
    WHERE v.offering_id = p_offering_id
      AND v.version = (SELECT MAX(x.version) FROM private.offering_bank_instruction_versions x WHERE x.offering_id = p_offering_id)
      AND v.status = 'verified'
      AND v.ownership_review <> 'review_required';
END;
$function$;