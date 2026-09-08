ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS provider_source_file_id text,
  ADD COLUMN IF NOT EXISTS provider_file_id text;