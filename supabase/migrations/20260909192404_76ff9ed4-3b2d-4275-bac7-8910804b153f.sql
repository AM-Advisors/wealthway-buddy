ALTER TABLE public.offering_documents
  ADD COLUMN IF NOT EXISTS template_pack text,
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS file_updated_at timestamptz;

CREATE TABLE IF NOT EXISTS public.offering_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_document_id uuid NOT NULL REFERENCES public.offering_documents(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  version integer NOT NULL,
  file_name text,
  file_path text,
  file_size_bytes bigint,
  source text NOT NULL DEFAULT 'upload',
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_document_id, version)
);

CREATE INDEX IF NOT EXISTS offering_document_versions_doc_idx
  ON public.offering_document_versions (offering_document_id, version DESC);
CREATE INDEX IF NOT EXISTS offering_document_versions_offering_idx
  ON public.offering_document_versions (offering_id, created_at DESC);

GRANT SELECT ON public.offering_document_versions TO authenticated;
GRANT ALL ON public.offering_document_versions TO service_role;

ALTER TABLE public.offering_document_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document versions readable by fund team" ON public.offering_document_versions;
CREATE POLICY "document versions readable by fund team"
  ON public.offering_document_versions
  FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.fund_managers fm
      WHERE fm.offering_id = offering_document_versions.offering_id
        AND fm.user_id = auth.uid()
    )
  );