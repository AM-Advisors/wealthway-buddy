ALTER TABLE public.investor_documents
  ADD COLUMN IF NOT EXISTS uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS uploaded_by_role text,
  ADD COLUMN IF NOT EXISTS prepared_for_person_id uuid;
COMMENT ON COLUMN public.investor_documents.prepared_for_person_id IS 'Set when a fund manager or Harmonious uploaded for an investor without an account; user_id moves to the investor when they claim.';