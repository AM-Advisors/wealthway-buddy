ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS provider_agreement_id text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_signing_url text,
  ADD COLUMN IF NOT EXISTS provider_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS manager_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS document_signatures_provider_agreement_id_idx
  ON public.document_signatures (provider_agreement_id);