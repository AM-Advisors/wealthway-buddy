CREATE OR REPLACE FUNCTION public.fund_condition_context(p_offering_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_client_name text;
  v_configured boolean := false;
  v_overrides jsonb := '{}'::jsonb;
  v_allowed boolean := false;
  v_clearances jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_unaccredited integer := 0;
  v_reg_type text;
  v_name text;
  r record;
BEGIN
  SELECT o.client_id, o.reg_type::text, o.name
    INTO v_client_id, v_reg_type, v_name
    FROM public.offerings o WHERE o.id = p_offering_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_allowed := private.is_staff(auth.uid())
    OR private.can_manage_contracts(auth.uid())
    OR EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = p_offering_id AND fm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.investor_fund_access a WHERE a.offering_id = p_offering_id AND a.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.investor_applications ia WHERE ia.offering_id = p_offering_id AND ia.user_id = auth.uid())
    OR (v_client_id IS NOT NULL AND private.client_visible(auth.uid(), v_client_id));

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not authorised for this fund';
  END IF;

  IF v_client_id IS NOT NULL THEN
    SELECT c.name INTO v_client_name FROM public.clients c WHERE c.id = v_client_id;
    FOR r IN
      SELECT s.eligibility FROM public.client_sows s
      WHERE s.client_id = v_client_id AND s.status = 'active'
    LOOP
      v_configured := true;
      v_overrides := v_overrides || coalesce(r.eligibility, '{}'::jsonb);
    END LOOP;
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE ia.accreditation_status::text IN ('declined','not_started'))
    INTO v_total, v_unaccredited
    FROM public.investor_applications ia
   WHERE ia.offering_id = p_offering_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'rule_key', fc.rule_key,
           'kind', fc.kind,
           'reason', fc.reason,
           'snapshot', fc.snapshot,
           'created_at', fc.created_at
         ) ORDER BY fc.created_at DESC), '[]'::jsonb)
    INTO v_clearances
    FROM public.fund_condition_clearances fc
   WHERE fc.offering_id = p_offering_id;

  RETURN jsonb_build_object(
    'offering_id', p_offering_id,
    'name', v_name,
    'reg_type', v_reg_type,
    'client_id', v_client_id,
    'client_name', v_client_name,
    'configured', v_configured,
    'overrides', v_overrides,
    'clearances', v_clearances,
    'investor_count', v_total,
    'unaccredited_count', v_unaccredited
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fund_condition_context(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fund_condition_context(uuid) TO authenticated;