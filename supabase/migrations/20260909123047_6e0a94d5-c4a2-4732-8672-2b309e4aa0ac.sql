ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS provider_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_viewed_at timestamptz;

CREATE INDEX IF NOT EXISTS document_signatures_provider_sent_at_idx
  ON public.document_signatures (provider_sent_at);