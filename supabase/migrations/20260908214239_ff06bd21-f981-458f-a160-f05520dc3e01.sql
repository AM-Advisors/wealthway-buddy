CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.offering_wire_instructions (
  offering_id uuid PRIMARY KEY REFERENCES public.offerings(id) ON DELETE CASCADE,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO private.offering_wire_instructions (offering_id, details, updated_at)
SELECT offering_id, details, updated_at FROM public.offering_wire_instructions
ON CONFLICT (offering_id) DO NOTHING;

REVOKE ALL ON private.offering_wire_instructions FROM anon, authenticated;
GRANT ALL ON private.offering_wire_instructions TO service_role;

DROP TABLE public.offering_wire_instructions;

CREATE OR REPLACE FUNCTION public.can_read_wire_instructions(_offering_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = _offering_id AND fm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.investor_applications a WHERE a.offering_id = _offering_id AND a.user_id = auth.uid())
  )
$$;

CREATE OR REPLACE FUNCTION public.get_wire_instructions(p_offering_id uuid)
RETURNS TABLE (offering_id uuid, details jsonb, updated_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_read_wire_instructions(p_offering_id) THEN
    RAISE EXCEPTION 'Not authorized to read wire instructions';
  END IF;
  RETURN QUERY
    SELECT w.offering_id, w.details, w.updated_at
    FROM private.offering_wire_instructions w
    WHERE w.offering_id = p_offering_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_wire_instructions()
RETURNS TABLE (offering_id uuid, details jsonb, updated_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized to read wire instructions';
  END IF;
  RETURN QUERY
    SELECT w.offering_id, w.details, w.updated_at
    FROM private.offering_wire_instructions w
    WHERE public.can_read_wire_instructions(w.offering_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_wire_instructions(p_offering_id uuid, p_details jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only administrators can change wire instructions';
  END IF;
  INSERT INTO private.offering_wire_instructions (offering_id, details, updated_at)
  VALUES (p_offering_id, COALESCE(p_details, '{}'::jsonb), now())
  ON CONFLICT (offering_id) DO UPDATE
    SET details = EXCLUDED.details, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.can_read_wire_instructions(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_wire_instructions(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.list_wire_instructions() FROM anon;
REVOKE ALL ON FUNCTION public.save_wire_instructions(uuid, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_wire_instructions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_wire_instructions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_wire_instructions(uuid, jsonb) TO authenticated;

DROP POLICY IF EXISTS "docs readable with their fund" ON public.offering_documents;
CREATE POLICY "public docs readable by visitors" ON public.offering_documents
FOR SELECT TO anon
USING (EXISTS (SELECT 1 FROM public.offerings o WHERE o.id = offering_documents.offering_id AND o.reg_type = '506c'::public.reg_type));

CREATE POLICY "docs readable by permitted users" ON public.offering_documents
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.offerings o
  WHERE o.id = offering_documents.offering_id
    AND (
      o.reg_type = '506c'::public.reg_type
      OR private.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = o.id AND fm.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.investor_fund_access ia WHERE ia.offering_id = o.id AND ia.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.investor_applications a WHERE a.offering_id = o.id AND a.user_id = auth.uid())
    )
));