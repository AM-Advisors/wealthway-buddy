CREATE TABLE public.drive_document_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.drive_imported_documents(id) ON DELETE CASCADE,
  offering_id uuid,
  doc_group text NOT NULL CHECK (doc_group IN ('fund_document','tax_deliverable')),
  doc_kind text NOT NULL,
  other_name text,
  signature_status text CHECK (signature_status IN ('signed_by_investor','signed_all_parties','no_signature','template')),
  signature_boxes jsonb NOT NULL DEFAULT '[]'::jsonb,
  shared_profile_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.drive_document_details TO service_role;
ALTER TABLE public.drive_document_details ENABLE ROW LEVEL SECURITY;
CREATE INDEX drive_document_details_doc_idx ON public.drive_document_details(document_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.drive_document_details_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'drive_document_details is append-only'; END $$;
CREATE TRIGGER drive_document_details_no_change BEFORE UPDATE OR DELETE ON public.drive_document_details
FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION public.drive_document_details_immutable();