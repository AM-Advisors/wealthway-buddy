CREATE OR REPLACE FUNCTION public.save_offering_entity_details(p_offering_id uuid, p_has_ein boolean, p_ein text, p_ss4 jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_staff boolean := private.has_role(auth.uid(), 'admin'::public.app_role);
  v_old jsonb;
  v_ss4 jsonb := COALESCE(p_ss4, '{}'::jsonb) - 'responsible_party_tin_last4';
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_diligence(p_offering_id) THEN
    RAISE EXCEPTION 'Only administrators or assigned fund managers can change entity details';
  END IF;
  SELECT ss4 INTO v_old FROM private.offering_entity_details WHERE offering_id = p_offering_id;
  -- Only Harmonious may set or change the responsible party's identifier; managers never overwrite it.
  IF NOT v_staff THEN
    v_ss4 := (v_ss4 - 'responsible_party_tin') ||
      CASE WHEN coalesce(v_old->>'responsible_party_tin','') <> '' THEN jsonb_build_object('responsible_party_tin', v_old->>'responsible_party_tin') ELSE '{}'::jsonb END;
  END IF;
  INSERT INTO private.offering_entity_details (offering_id, has_ein, ein, ss4, updated_by, updated_at)
  VALUES (p_offering_id, COALESCE(p_has_ein, false), NULLIF(btrim(COALESCE(p_ein, '')), ''), v_ss4, auth.uid(), now())
  ON CONFLICT (offering_id) DO UPDATE
    SET has_ein = EXCLUDED.has_ein, ein = EXCLUDED.ein, ss4 = EXCLUDED.ss4, updated_by = auth.uid(), updated_at = now();
END;
$function$;