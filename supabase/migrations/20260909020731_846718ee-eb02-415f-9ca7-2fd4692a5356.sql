CREATE OR REPLACE FUNCTION public.save_wire_instructions(p_offering_id uuid, p_details jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.fund_managers fm
      WHERE fm.offering_id = p_offering_id AND fm.user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Only administrators or assigned fund managers can change wire instructions';
  END IF;
  INSERT INTO private.offering_wire_instructions (offering_id, details, updated_at)
  VALUES (p_offering_id, COALESCE(p_details, '{}'::jsonb), now())
  ON CONFLICT (offering_id) DO UPDATE
    SET details = EXCLUDED.details, updated_at = now();
END;
$function$;