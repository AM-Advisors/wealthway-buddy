
CREATE OR REPLACE FUNCTION private.fdr_fund_id(_name text)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN split_part(_name, '/', 1) = 'fund'
     AND split_part(_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(_name, '/', 2)::uuid
  END
$$;

CREATE OR REPLACE FUNCTION private.fdr_lp_id(_name text)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN split_part(_name, '/', 1) = 'fund'
     AND split_part(_name, '/', 3) = 'lp'
     AND split_part(_name, '/', 4) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(_name, '/', 4)::uuid
  END
$$;

CREATE OR REPLACE FUNCTION private.fdr_is_lp_object(_name text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT split_part(_name, '/', 1) = 'fund' AND split_part(_name, '/', 3) = 'lp'
$$;

CREATE OR REPLACE FUNCTION private.fdr_can_read(_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fund uuid := private.fdr_fund_id(_name);
  v_lp uuid := private.fdr_lp_id(_name);
  v_is_lp boolean := private.fdr_is_lp_object(_name);
BEGIN
  IF v_uid IS NULL OR v_fund IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.offerings o WHERE o.id = v_fund) THEN RETURN false; END IF;
  IF private.is_staff(v_uid) THEN RETURN true; END IF;
  IF v_is_lp THEN
    IF v_lp IS NULL OR v_lp <> v_uid THEN RETURN false; END IF;
    RETURN EXISTS (SELECT 1 FROM public.investor_applications ia WHERE ia.offering_id = v_fund AND ia.user_id = v_uid);
  END IF;
  IF EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = v_fund AND fm.user_id = v_uid) THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.investor_fund_access ifa WHERE ifa.offering_id = v_fund AND ifa.user_id = v_uid);
END;
$$;

CREATE OR REPLACE FUNCTION private.fdr_can_write(_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fund uuid := private.fdr_fund_id(_name);
  v_lp uuid := private.fdr_lp_id(_name);
  v_is_lp boolean := private.fdr_is_lp_object(_name);
BEGIN
  IF v_uid IS NULL OR v_fund IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.offerings o WHERE o.id = v_fund) THEN RETURN false; END IF;
  IF private.is_staff(v_uid) THEN RETURN true; END IF;
  IF v_is_lp THEN
    IF v_lp IS NULL OR v_lp <> v_uid THEN RETURN false; END IF;
    RETURN EXISTS (SELECT 1 FROM public.investor_applications ia WHERE ia.offering_id = v_fund AND ia.user_id = v_uid);
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = v_fund AND fm.user_id = v_uid);
END;
$$;

CREATE OR REPLACE FUNCTION private.fdr_can_modify(_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF private.is_staff(v_uid) THEN RETURN true; END IF;
  IF private.fdr_is_lp_object(_name) THEN RETURN false; END IF;
  RETURN private.fdr_can_write(_name);
END;
$$;

DROP POLICY IF EXISTS "fund_data_room_select" ON storage.objects;
DROP POLICY IF EXISTS "fund_data_room_insert" ON storage.objects;
DROP POLICY IF EXISTS "fund_data_room_update" ON storage.objects;
DROP POLICY IF EXISTS "fund_data_room_delete" ON storage.objects;

CREATE POLICY "fund_data_room_select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'fund-data-room' AND private.fdr_can_read(name));

CREATE POLICY "fund_data_room_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'fund-data-room' AND private.fdr_can_write(name));

CREATE POLICY "fund_data_room_update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'fund-data-room' AND private.fdr_can_modify(name))
WITH CHECK (bucket_id = 'fund-data-room' AND private.fdr_can_modify(name));

CREATE POLICY "fund_data_room_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'fund-data-room' AND private.fdr_can_modify(name));

DROP FUNCTION IF EXISTS public.fdr_can_read(text);
DROP FUNCTION IF EXISTS public.fdr_can_write(text);
DROP FUNCTION IF EXISTS public.fdr_can_modify(text);
DROP FUNCTION IF EXISTS public.fdr_fund_id(text);
DROP FUNCTION IF EXISTS public.fdr_lp_id(text);
DROP FUNCTION IF EXISTS public.fdr_is_lp_object(text);
