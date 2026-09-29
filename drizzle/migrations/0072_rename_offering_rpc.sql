CREATE OR REPLACE FUNCTION public.rename_offering(_offering uuid, _name text, _reason text, _effective date, _actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('harmonious.rename_reason', coalesce(_reason, ''), true);
  PERFORM set_config('harmonious.rename_effective', coalesce(_effective::text, ''), true);
  PERFORM set_config('harmonious.rename_actor', coalesce(_actor::text, ''), true);
  UPDATE public.offerings SET name = _name WHERE id = _offering;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.rename_offering(uuid, text, text, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rename_offering(uuid, text, text, date, uuid) TO service_role;