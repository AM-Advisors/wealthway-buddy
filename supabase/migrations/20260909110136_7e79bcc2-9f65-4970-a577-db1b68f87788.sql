ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS box_file_id text,
  ADD COLUMN IF NOT EXISTS box_folder_id text,
  ADD COLUMN IF NOT EXISTS box_uploaded_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS box_error text;

CREATE INDEX IF NOT EXISTS document_signatures_box_uploaded_idx
  ON public.document_signatures (box_uploaded_at);