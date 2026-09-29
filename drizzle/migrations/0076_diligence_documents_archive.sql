ALTER TABLE public.diligence_documents ADD COLUMN IF NOT EXISTS archived_at timestamptz, ADD COLUMN IF NOT EXISTS archived_by uuid;
GRANT UPDATE ON public.diligence_documents TO authenticated;
DROP POLICY IF EXISTS "Document readers" ON public.diligence_documents;
CREATE POLICY "Document readers" ON public.diligence_documents FOR SELECT TO authenticated
USING (public.can_manage_diligence(offering_id) OR (archived_at IS NULL AND public.can_view_diligence(offering_id) AND public.diligence_doc_allowed(id)));
CREATE POLICY "Document managers archive" ON public.diligence_documents FOR UPDATE TO authenticated
USING (public.can_manage_diligence(offering_id)) WITH CHECK (public.can_manage_diligence(offering_id));
COMMENT ON COLUMN public.diligence_documents.archived_at IS 'Removed from Diligence Room; row, version and Box file preserved.';