ALTER TABLE public.fund_file_signatures ADD COLUMN IF NOT EXISTS packet_id uuid, ADD COLUMN IF NOT EXISTS signature_page text;
CREATE INDEX IF NOT EXISTS fund_file_signatures_packet_idx ON public.fund_file_signatures(packet_id);
ALTER TABLE public.fund_files ADD COLUMN IF NOT EXISTS signing_order text NOT NULL DEFAULT 'investor_first', ADD COLUMN IF NOT EXISTS signing_mode text NOT NULL DEFAULT 'full';
ALTER TABLE public.fund_files ADD CONSTRAINT fund_files_signing_order_check CHECK (signing_order IN ('investor_first','manager_first','manager_only','investor_only'));
ALTER TABLE public.fund_files ADD CONSTRAINT fund_files_signing_mode_check CHECK (signing_mode IN ('full','signature_page'));