CREATE OR REPLACE FUNCTION private.masked_current_bank_details(p_offering_id uuid)
RETURNS TABLE(details jsonb, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
      'bank_name', NULLIF(v.details->>'bank_name',''),
      'account_name', NULLIF(v.details->>'account_name',''),
      'account_number', CASE WHEN coalesce(v.details->>'account_number','') <> '' THEN '•••• ' || right(v.details->>'account_number', 4) END,
      'routing_number', CASE WHEN coalesce(v.details->>'routing_number','') <> '' THEN '•••• ' || right(v.details->>'routing_number', 4) END
    )), v.created_at
  FROM private.offering_bank_instruction_versions v
  WHERE v.offering_id = p_offering_id
    AND v.version = (SELECT MAX(x.version) FROM private.offering_bank_instruction_versions x WHERE x.offering_id = p_offering_id);
$$;
REVOKE ALL ON FUNCTION private.masked_current_bank_details(uuid) FROM PUBLIC, anon, authenticated;

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
  -- Fund Managers: masked summary of the current canonical banking version only.
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
  RETURN QUERY
    SELECT v.offering_id, v.details, v.verified_at
    FROM private.offering_bank_instruction_versions v
    WHERE v.offering_id = p_offering_id
      AND v.version = (SELECT MAX(x.version) FROM private.offering_bank_instruction_versions x WHERE x.offering_id = p_offering_id)
      AND v.status = 'verified'
      AND v.ownership_review <> 'review_required';
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_wire_instructions()
 RETURNS TABLE(offering_id uuid, details jsonb, updated_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized to read wire instructions';
  END IF;
  IF private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN QUERY SELECT w.offering_id, w.details, w.updated_at FROM private.offering_wire_instructions w;
    RETURN;
  END IF;
  -- Managers: masked current version for their funds. Investors: nothing here (use get_wire_instructions).
  RETURN QUERY
    SELECT fm.offering_id, m.details, m.updated_at
    FROM public.fund_managers fm
    CROSS JOIN LATERAL private.masked_current_bank_details(fm.offering_id) m
    WHERE fm.user_id = auth.uid();
END;
$function$;