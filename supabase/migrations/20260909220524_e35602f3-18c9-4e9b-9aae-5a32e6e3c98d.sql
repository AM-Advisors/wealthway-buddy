ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS legal_entity_name text,
  ADD COLUMN IF NOT EXISTS fund_type text,
  ADD COLUMN IF NOT EXISTS fund_type_other text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS state_formed text,
  ADD COLUMN IF NOT EXISTS date_formed date;

CREATE TABLE IF NOT EXISTS private.offering_entity_details (
  offering_id uuid PRIMARY KEY REFERENCES public.offerings(id) ON DELETE CASCADE,
  has_ein boolean NOT NULL DEFAULT false,
  ein text,
  ss4 jsonb NOT NULL DEFAULT '{}'::jsonb,
  ss4_storage_path text,
  ss4_generated_at timestamptz,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON private.offering_entity_details FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_offering_entity_details(p_offering_id uuid)
RETURNS TABLE(offering_id uuid, has_ein boolean, ein text, ss4 jsonb, ss4_storage_path text, ss4_generated_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.can_manage_diligence(p_offering_id) THEN
    RAISE EXCEPTION 'Not authorized to read this fund''s entity details';
  END IF;
  RETURN QUERY
    SELECT e.offering_id, e.has_ein, e.ein, e.ss4, e.ss4_storage_path, e.ss4_generated_at, e.updated_at
    FROM private.offering_entity_details e
    WHERE e.offering_id = p_offering_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_offering_entity_details(
  p_offering_id uuid,
  p_has_ein boolean,
  p_ein text,
  p_ss4 jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_diligence(p_offering_id) THEN
    RAISE EXCEPTION 'Only administrators or assigned fund managers can change entity details';
  END IF;
  INSERT INTO private.offering_entity_details (offering_id, has_ein, ein, ss4, updated_by, updated_at)
  VALUES (p_offering_id, COALESCE(p_has_ein, false), NULLIF(btrim(COALESCE(p_ein, '')), ''), COALESCE(p_ss4, '{}'::jsonb), auth.uid(), now())
  ON CONFLICT (offering_id) DO UPDATE
    SET has_ein = EXCLUDED.has_ein,
        ein = EXCLUDED.ein,
        ss4 = EXCLUDED.ss4,
        updated_by = auth.uid(),
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.save_offering_ss4_file(p_offering_id uuid, p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_diligence(p_offering_id) THEN
    RAISE EXCEPTION 'Only administrators or assigned fund managers can file this form';
  END IF;
  INSERT INTO private.offering_entity_details (offering_id, ss4_storage_path, ss4_generated_at, updated_by, updated_at)
  VALUES (p_offering_id, p_path, now(), auth.uid(), now())
  ON CONFLICT (offering_id) DO UPDATE
    SET ss4_storage_path = EXCLUDED.ss4_storage_path,
        ss4_generated_at = now(),
        updated_by = auth.uid(),
        updated_at = now();
END;
$$;

CREATE TABLE public.offering_bank_setup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  bank text NOT NULL CHECK (bank IN ('mercury', 'texas_capital', 'customers')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'in_progress', 'opened', 'cancelled')),
  note text,
  requested_by uuid,
  requested_by_email text,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.offering_bank_setup_requests TO authenticated;
GRANT ALL ON public.offering_bank_setup_requests TO service_role;

ALTER TABLE public.offering_bank_setup_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fund team reads bank setup requests"
  ON public.offering_bank_setup_requests FOR SELECT TO authenticated
  USING (public.can_manage_diligence(offering_id));

CREATE POLICY "Fund team creates bank setup requests"
  ON public.offering_bank_setup_requests FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_diligence(offering_id) AND requested_by = auth.uid());

CREATE POLICY "Fund team updates bank setup requests"
  ON public.offering_bank_setup_requests FOR UPDATE TO authenticated
  USING (public.can_manage_diligence(offering_id))
  WITH CHECK (public.can_manage_diligence(offering_id));

CREATE INDEX IF NOT EXISTS offering_bank_setup_requests_offering_idx
  ON public.offering_bank_setup_requests (offering_id, created_at DESC);

CREATE TRIGGER offering_bank_setup_requests_updated_at
  BEFORE UPDATE ON public.offering_bank_setup_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();