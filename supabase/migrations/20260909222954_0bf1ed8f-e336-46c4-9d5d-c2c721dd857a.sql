-- 1. Operations role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operations';

-- 2. Who can review (admins + operations). Text comparison avoids using the
-- freshly-added enum label inside this same transaction.
CREATE OR REPLACE FUNCTION public.can_review_operations()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role::text IN ('admin','operations')
  )
$$;

-- 3. Bank setup request review fields
ALTER TABLE public.offering_bank_setup_requests
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'offering_bank_setup_requests_review_status_check'
  ) THEN
    ALTER TABLE public.offering_bank_setup_requests
      ADD CONSTRAINT offering_bank_setup_requests_review_status_check
      CHECK (review_status IN ('pending','approved','rejected'));
  END IF;
END $$;

DROP POLICY IF EXISTS "Operations can review bank setup requests" ON public.offering_bank_setup_requests;
CREATE POLICY "Operations can review bank setup requests"
ON public.offering_bank_setup_requests
FOR ALL
TO authenticated
USING (public.can_review_operations())
WITH CHECK (public.can_review_operations());

-- 4. Entity detail review fields (private schema)
ALTER TABLE private.offering_entity_details
  ADD COLUMN IF NOT EXISTS ein_review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ss4_review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

DROP FUNCTION IF EXISTS public.get_offering_entity_details(uuid);
CREATE FUNCTION public.get_offering_entity_details(p_offering_id uuid)
RETURNS TABLE(
  offering_id uuid,
  has_ein boolean,
  ein text,
  ss4 jsonb,
  ss4_storage_path text,
  ss4_generated_at timestamptz,
  updated_at timestamptz,
  ein_review_status text,
  ss4_review_status text,
  reviewed_at timestamptz,
  review_note text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.can_manage_diligence(p_offering_id) OR public.can_review_operations()) THEN
    RAISE EXCEPTION 'Not authorized to read this fund''s entity details';
  END IF;
  RETURN QUERY
    SELECT e.offering_id, e.has_ein, e.ein, e.ss4, e.ss4_storage_path, e.ss4_generated_at,
           e.updated_at, e.ein_review_status, e.ss4_review_status, e.reviewed_at, e.review_note
    FROM private.offering_entity_details e
    WHERE e.offering_id = p_offering_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_offering_entity(
  p_offering_id uuid,
  p_ein_status text,
  p_ss4_status text,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_review_operations() THEN
    RAISE EXCEPTION 'Only the operations team can review fund formation records';
  END IF;
  IF p_ein_status NOT IN ('pending','approved','rejected')
     OR p_ss4_status NOT IN ('pending','approved','rejected') THEN
    RAISE EXCEPTION 'Unknown review status';
  END IF;
  INSERT INTO private.offering_entity_details (offering_id, ein_review_status, ss4_review_status, reviewed_by, reviewed_at, review_note, updated_at)
  VALUES (p_offering_id, p_ein_status, p_ss4_status, auth.uid(), now(), NULLIF(btrim(COALESCE(p_note,'')),''), now())
  ON CONFLICT (offering_id) DO UPDATE
    SET ein_review_status = EXCLUDED.ein_review_status,
        ss4_review_status = EXCLUDED.ss4_review_status,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = EXCLUDED.review_note,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.list_entity_reviews()
RETURNS TABLE(
  offering_id uuid,
  has_ein boolean,
  ein_masked text,
  has_ss4_file boolean,
  ss4_generated_at timestamptz,
  ein_review_status text,
  ss4_review_status text,
  reviewed_at timestamptz,
  review_note text,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_review_operations() THEN
    RAISE EXCEPTION 'Only the operations team can review fund formation records';
  END IF;
  RETURN QUERY
    SELECT e.offering_id,
           e.has_ein,
           CASE WHEN e.ein IS NULL OR e.ein = '' THEN NULL ELSE e.ein END,
           (e.ss4_storage_path IS NOT NULL),
           e.ss4_generated_at,
           e.ein_review_status,
           e.ss4_review_status,
           e.reviewed_at,
           e.review_note,
           e.updated_at
    FROM private.offering_entity_details e
    ORDER BY e.updated_at DESC;
END;
$$;

-- 5. Fund tax documents
CREATE TABLE IF NOT EXISTS public.fund_tax_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  investor_user_id uuid,
  doc_type text NOT NULL CHECK (doc_type IN ('w9','w8ben','w8bene','k1','other')),
  tax_year integer,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  note text,
  uploaded_by uuid,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fund_tax_documents_offering_idx ON public.fund_tax_documents (offering_id);
CREATE INDEX IF NOT EXISTS fund_tax_documents_status_idx ON public.fund_tax_documents (review_status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_tax_documents TO authenticated;
GRANT ALL ON public.fund_tax_documents TO service_role;

ALTER TABLE public.fund_tax_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Operations manage tax documents" ON public.fund_tax_documents;
CREATE POLICY "Operations manage tax documents"
ON public.fund_tax_documents
FOR ALL
TO authenticated
USING (public.can_review_operations())
WITH CHECK (public.can_review_operations());

DROP POLICY IF EXISTS "Fund managers read approved tax documents" ON public.fund_tax_documents;
CREATE POLICY "Fund managers read approved tax documents"
ON public.fund_tax_documents
FOR SELECT
TO authenticated
USING (review_status = 'approved' AND public.can_manage_diligence(offering_id));

DROP TRIGGER IF EXISTS fund_tax_documents_updated_at ON public.fund_tax_documents;
CREATE TRIGGER fund_tax_documents_updated_at
BEFORE UPDATE ON public.fund_tax_documents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Grant the operations role on sign-up from an invitation
CREATE OR REPLACE FUNCTION public.sync_roles_and_invitations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(COALESCE(NEW.email, ''));
  inv RECORD;
BEGIN
  IF NEW.email_confirmed_at IS NULL OR v_email = '' THEN
    RETURN NEW;
  END IF;

  IF split_part(v_email, '@', 2) = 'harmonious.co' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = NEW.id AND role = 'admin'::public.app_role;
  END IF;

  FOR inv IN
    SELECT * FROM public.fund_invitations
    WHERE lower(email) = v_email AND status = 'pending' AND expires_at > now()
  LOOP
    IF inv.role::text = 'operations' THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, inv.role)
      ON CONFLICT (user_id, role) DO NOTHING;
    ELSIF inv.role = 'fund_manager'::public.app_role THEN
      INSERT INTO public.fund_managers (user_id, offering_id, granted_by)
      VALUES (NEW.id, inv.offering_id, inv.invited_by)
      ON CONFLICT (user_id, offering_id) DO NOTHING;
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'fund_manager'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    ELSE
      INSERT INTO public.investor_fund_access (user_id, offering_id, granted_by)
      VALUES (NEW.id, inv.offering_id, inv.invited_by)
      ON CONFLICT (user_id, offering_id) DO NOTHING;
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'investor'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;

    UPDATE public.fund_invitations
      SET status = 'accepted', accepted_at = now(), accepted_by = NEW.id
      WHERE id = inv.id;
  END LOOP;

  RETURN NEW;
END;
$$;