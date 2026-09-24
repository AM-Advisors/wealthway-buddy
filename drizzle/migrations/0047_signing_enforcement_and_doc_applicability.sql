ALTER TABLE public.investor_document_snapshots
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_fingerprint text,
  ADD COLUMN IF NOT EXISTS provider_request_id text;
ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS snapshot_id uuid,
  ADD COLUMN IF NOT EXISTS snapshot_version integer;
ALTER TABLE public.offering_documents
  ADD COLUMN IF NOT EXISTS applies_to text[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.offering_documents.applies_to IS 'Investment profile types this document applies to; empty = all investors. Harmonious-controlled.';

CREATE OR REPLACE FUNCTION public.protect_doc_applicability() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (TG_OP = 'INSERT' AND coalesce(array_length(NEW.applies_to,1),0) > 0 AND NOT public.is_any_staff())
     OR (TG_OP = 'UPDATE' AND (NEW.applies_to IS DISTINCT FROM OLD.applies_to OR NEW.investor_required IS DISTINCT FROM OLD.investor_required) AND NOT public.is_any_staff()) THEN
    RAISE EXCEPTION 'Only Harmonious can change which investors a document applies to or whether it is required';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS offering_documents_applicability_guard ON public.offering_documents;
CREATE TRIGGER offering_documents_applicability_guard BEFORE INSERT OR UPDATE ON public.offering_documents FOR EACH ROW EXECUTE FUNCTION public.protect_doc_applicability();