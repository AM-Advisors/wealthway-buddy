ALTER TABLE public.diligence_documents
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'all';

CREATE TABLE IF NOT EXISTS public.diligence_document_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.diligence_documents(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  investor_user_id uuid NOT NULL,
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, investor_user_id)
);

CREATE INDEX IF NOT EXISTS diligence_document_access_doc_idx ON public.diligence_document_access(document_id);
CREATE INDEX IF NOT EXISTS diligence_document_access_user_idx ON public.diligence_document_access(investor_user_id);

GRANT SELECT, INSERT, DELETE ON public.diligence_document_access TO authenticated;
GRANT ALL ON public.diligence_document_access TO service_role;
ALTER TABLE public.diligence_document_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage document access"
  ON public.diligence_document_access FOR ALL TO authenticated
  USING (public.can_manage_diligence(offering_id))
  WITH CHECK (public.can_manage_diligence(offering_id));

CREATE POLICY "Investors read their own document access"
  ON public.diligence_document_access FOR SELECT TO authenticated
  USING (investor_user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.diligence_investor_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  investor_user_id uuid NOT NULL,
  cap_table_visible boolean NOT NULL DEFAULT true,
  note text,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_id, investor_user_id)
);

CREATE INDEX IF NOT EXISTS diligence_investor_permissions_user_idx
  ON public.diligence_investor_permissions(investor_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diligence_investor_permissions TO authenticated;
GRANT ALL ON public.diligence_investor_permissions TO service_role;
ALTER TABLE public.diligence_investor_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage investor permissions"
  ON public.diligence_investor_permissions FOR ALL TO authenticated
  USING (public.can_manage_diligence(offering_id))
  WITH CHECK (public.can_manage_diligence(offering_id));

CREATE POLICY "Investors read their own permissions"
  ON public.diligence_investor_permissions FOR SELECT TO authenticated
  USING (investor_user_id = auth.uid());

CREATE TRIGGER diligence_investor_permissions_updated
  BEFORE UPDATE ON public.diligence_investor_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.diligence_doc_allowed(_document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.diligence_documents d
    WHERE d.id = _document_id
      AND (
        d.visibility = 'all'
        OR EXISTS (
          SELECT 1 FROM public.diligence_document_access a
          WHERE a.document_id = d.id AND a.investor_user_id = auth.uid()
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.diligence_cap_table_visible(_offering_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.diligence_investor_permissions p
    WHERE p.offering_id = _offering_id
      AND p.investor_user_id = auth.uid()
      AND p.cap_table_visible = false
  )
$$;

DROP POLICY IF EXISTS "Document readers" ON public.diligence_documents;
DROP POLICY IF EXISTS "diligence documents read behind nda" ON public.diligence_documents;

CREATE POLICY "Document readers"
  ON public.diligence_documents FOR SELECT TO authenticated
  USING (
    public.can_manage_diligence(offering_id)
    OR (public.can_view_diligence(offering_id) AND public.diligence_doc_allowed(id))
  );

DROP POLICY IF EXISTS "Room viewers can read the cap table" ON public.diligence_cap_table;

CREATE POLICY "Room viewers can read the cap table"
  ON public.diligence_cap_table FOR SELECT TO authenticated
  USING (
    public.diligence_access_open(offering_id)
    AND public.diligence_cap_table_visible(offering_id)
  );