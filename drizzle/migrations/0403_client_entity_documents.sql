CREATE TABLE public.client_entity_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.client_entities(id),
  client_id uuid NOT NULL,
  doc_kind text NOT NULL CHECK (doc_kind IN ('certificate_of_formation','formation_filing','ein_letter','operating_agreement','seal','other')),
  title text NOT NULL,
  original_filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  sha256 text,
  storage_path text NOT NULL UNIQUE,
  source text NOT NULL CHECK (source IN ('google_drive','upload')),
  drive_file_id text,
  drive_md5 text,
  effective_date date,
  added_by uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  retired_by uuid,
  retire_reason text
);
GRANT ALL ON public.client_entity_documents TO service_role;
ALTER TABLE public.client_entity_documents ENABLE ROW LEVEL SECURITY;
-- No client policies: reached only through server functions that check Harmonious staff roles.
CREATE INDEX client_entity_documents_entity_idx ON public.client_entity_documents (entity_id) WHERE retired_at IS NULL;
CREATE UNIQUE INDEX client_entity_documents_drive_once ON public.client_entity_documents (entity_id, drive_md5) WHERE drive_md5 IS NOT NULL AND retired_at IS NULL;

CREATE OR REPLACE FUNCTION public.block_entity_document_rewrite() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Company documents are kept; retire instead of deleting.';
  END IF;
  IF OLD.retired_at IS NOT NULL THEN
    RAISE EXCEPTION 'A retired company document cannot be changed.';
  END IF;
  IF (NEW.entity_id, NEW.client_id, NEW.doc_kind, NEW.title, NEW.original_filename, NEW.mime_type, NEW.size_bytes, NEW.sha256,
      NEW.storage_path, NEW.source, NEW.drive_file_id, NEW.drive_md5, NEW.effective_date, NEW.added_by, NEW.added_at)
     IS DISTINCT FROM
     (OLD.entity_id, OLD.client_id, OLD.doc_kind, OLD.title, OLD.original_filename, OLD.mime_type, OLD.size_bytes, OLD.sha256,
      OLD.storage_path, OLD.source, OLD.drive_file_id, OLD.drive_md5, OLD.effective_date, OLD.added_by, OLD.added_at) THEN
    RAISE EXCEPTION 'Company documents cannot be rewritten; only retirement is allowed.';
  END IF;
  IF NEW.retired_at IS NULL OR NEW.retired_by IS NULL OR coalesce(trim(NEW.retire_reason), '') = '' THEN
    RAISE EXCEPTION 'Retiring needs who and why.';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER client_entity_documents_guard
BEFORE UPDATE OR DELETE ON public.client_entity_documents
FOR EACH ROW EXECUTE FUNCTION public.block_entity_document_rewrite();