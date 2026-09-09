ALTER TABLE public.investor_documents
  ADD COLUMN IF NOT EXISTS box_file_id text,
  ADD COLUMN IF NOT EXISTS box_folder_id text,
  ADD COLUMN IF NOT EXISTS box_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS box_error text;