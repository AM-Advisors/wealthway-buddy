ALTER TABLE public.fund_banking_setups ADD COLUMN IF NOT EXISTS investor_instructions_released_version integer;

UPDATE public.fund_banking_setups b SET investor_instructions_released_version = (
  SELECT MAX(v.version) FROM private.offering_bank_instruction_versions v
  JOIN public.fund_setups s ON s.offering_id = v.offering_id WHERE s.id = b.setup_id)
WHERE b.investor_instructions_released = true AND b.investor_instructions_released_version IS NULL;

CREATE OR REPLACE FUNCTION public.offering_wire_release_state(p_offering_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH v AS (
    SELECT x.version, x.status, x.ownership_review FROM private.offering_bank_instruction_versions x
    WHERE x.offering_id = p_offering_id ORDER BY x.version DESC LIMIT 1
  ), b AS (
    SELECT fb.status, fb.investor_instructions_released, fb.investor_instructions_released_version
    FROM public.fund_banking_setups fb JOIN public.fund_setups s ON s.id = fb.setup_id
    WHERE s.offering_id = p_offering_id LIMIT 1
  )
  SELECT jsonb_build_object(
    'latestVersion', (SELECT version FROM v),
    'verified', COALESCE((SELECT status = 'verified' AND ownership_review <> 'review_required' FROM v), false),
    'bankingStatus', (SELECT status FROM b),
    'released', COALESCE((SELECT investor_instructions_released FROM b), false),
    'releasedVersion', (SELECT investor_instructions_released_version FROM b),
    'available', COALESCE((
      SELECT v.status = 'verified' AND v.ownership_review <> 'review_required'
        AND b.status = 'account_active' AND b.investor_instructions_released
        AND b.investor_instructions_released_version = v.version
      FROM v, b), false));
$$;
REVOKE ALL ON FUNCTION public.offering_wire_release_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.offering_wire_release_state(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_wire_instructions(p_offering_id uuid)
 RETURNS TABLE(offering_id uuid, details jsonb, updated_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_read_wire_instructions(p_offering_id) THEN
    RAISE EXCEPTION 'Not authorized to read wire instructions';
  END IF;
  IF private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN QUERY SELECT w.offering_id, w.details, w.updated_at FROM private.offering_wire_instructions w WHERE w.offering_id = p_offering_id;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = p_offering_id AND fm.user_id = auth.uid()) THEN
    RETURN QUERY SELECT p_offering_id, m.details, m.updated_at FROM private.masked_current_bank_details(p_offering_id) m;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.investor_applications a
     WHERE a.offering_id = p_offering_id AND a.user_id = auth.uid()
       AND (a.documents_status::text = 'approved' OR a.status::text IN ('funded','closed'))
  ) THEN
    RETURN;
  END IF;
  -- Investors: only the exact verified version Harmonious released.
  IF NOT COALESCE((public.offering_wire_release_state(p_offering_id)->>'available')::boolean, false) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT v.offering_id, v.details, v.verified_at
    FROM private.offering_bank_instruction_versions v
    WHERE v.offering_id = p_offering_id
      AND v.version = (SELECT MAX(x.version) FROM private.offering_bank_instruction_versions x WHERE x.offering_id = p_offering_id)
      AND v.status = 'verified' AND v.ownership_review <> 'review_required';
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_wire_instructions_for_packet(p_offering_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT v.details FROM private.offering_bank_instruction_versions v
  WHERE v.offering_id = p_offering_id
    AND v.version = (SELECT MAX(x.version) FROM private.offering_bank_instruction_versions x WHERE x.offering_id = p_offering_id)
    AND v.status = 'verified' AND v.ownership_review <> 'review_required'
    AND COALESCE((public.offering_wire_release_state(p_offering_id)->>'available')::boolean, false);
$function$;