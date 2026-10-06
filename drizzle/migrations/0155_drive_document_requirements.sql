CREATE TABLE public.drive_document_requirement_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.drive_imported_documents(id),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  requirement_key text NOT NULL CHECK (requirement_key IN ('ein_letter','wire_instructions','ppm','operating_agreement','subscription_agreement','formation_certificate','lloa','investor_information','investor_kyc_form','w9','side_letter','other','none')),
  note text,
  assigned_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drive_doc_req_doc_idx ON public.drive_document_requirement_assignments(document_id, created_at DESC);
CREATE INDEX drive_doc_req_off_idx ON public.drive_document_requirement_assignments(offering_id);
GRANT SELECT, INSERT ON public.drive_document_requirement_assignments TO service_role;
ALTER TABLE public.drive_document_requirement_assignments ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_drive_requirement_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Requirement assignments are append-only; add a new assignment instead.'; END $$;
CREATE TRIGGER drive_document_requirement_assignments_immutable BEFORE UPDATE OR DELETE ON public.drive_document_requirement_assignments FOR EACH ROW EXECUTE FUNCTION public.block_drive_requirement_mutation();