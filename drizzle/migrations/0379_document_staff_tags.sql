CREATE TABLE public.document_staff_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_source text NOT NULL CHECK (doc_source IN ('investor_document','tax_document','k1','signature')),
  doc_id uuid NOT NULL,
  tag text NOT NULL CHECK (char_length(tag) BETWEEN 1 AND 40),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_by uuid,
  removed_at timestamptz
);
CREATE UNIQUE INDEX document_staff_tags_active ON public.document_staff_tags (doc_source, doc_id, lower(tag)) WHERE removed_at IS NULL;
CREATE INDEX document_staff_tags_doc ON public.document_staff_tags (doc_id);
GRANT SELECT ON public.document_staff_tags TO authenticated;
GRANT ALL ON public.document_staff_tags TO service_role;
ALTER TABLE public.document_staff_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read document tags" ON public.document_staff_tags FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE OR REPLACE FUNCTION public.block_document_tag_rewrite() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Document tags are retained; remove them instead.'; END IF;
  IF OLD.removed_at IS NOT NULL OR NEW.tag <> OLD.tag OR NEW.doc_id <> OLD.doc_id OR NEW.doc_source <> OLD.doc_source OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Only removal of an active tag is allowed.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER document_staff_tags_guard BEFORE UPDATE OR DELETE ON public.document_staff_tags FOR EACH ROW EXECUTE FUNCTION public.block_document_tag_rewrite();