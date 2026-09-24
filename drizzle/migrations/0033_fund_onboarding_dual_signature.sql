ALTER TABLE public.offering_documents
  ADD COLUMN IF NOT EXISTS signing_mode text NOT NULL DEFAULT 'investor_only',
  ADD COLUMN IF NOT EXISTS countersigner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS investor_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS signature_template_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.offering_documents DROP CONSTRAINT IF EXISTS offering_documents_signing_mode_check;
ALTER TABLE public.offering_documents ADD CONSTRAINT offering_documents_signing_mode_check
  CHECK (signing_mode IN ('investor_only','dual'));

ALTER TABLE public.offering_document_signature_blocks
  ADD COLUMN IF NOT EXISTS signer_role text NOT NULL DEFAULT 'investor';
ALTER TABLE public.offering_document_signature_blocks DROP CONSTRAINT IF EXISTS offering_document_signature_blocks_signer_role_check;
ALTER TABLE public.offering_document_signature_blocks ADD CONSTRAINT offering_document_signature_blocks_signer_role_check
  CHECK (signer_role IN ('investor','fund_manager'));
ALTER TABLE public.offering_document_signature_blocks DROP CONSTRAINT IF EXISTS offering_document_signature_blocks_block_type_check;
ALTER TABLE public.offering_document_signature_blocks ADD CONSTRAINT offering_document_signature_blocks_block_type_check
  CHECK (block_type IN ('signature','initials','date','full_name','title','entity_name','text'));

ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS signing_mode text,
  ADD COLUMN IF NOT EXISTS signature_template_version integer;