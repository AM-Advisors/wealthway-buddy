-- Box-connected signing: per-signer tracking, document version locking and
-- webhook idempotency. Additive only; existing single-signer rows keep working.

-- 1. Version locking and profile linkage on the existing signature record.
ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS source_file_version_id text,
  ADD COLUMN IF NOT EXISTS signed_file_version_id text,
  ADD COLUMN IF NOT EXISTS investment_profile_id uuid,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS signer_capacity text,
  ADD COLUMN IF NOT EXISTS provider_declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_error text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS superseded_by uuid;

COMMENT ON COLUMN public.document_signatures.source_file_version_id IS
  'Box file version sent for signature. Locked at send time: a later edit to the source document never changes an outstanding request.';
COMMENT ON COLUMN public.document_signatures.signed_file_version_id IS
  'Box file version of the completed, certified signed document.';

CREATE INDEX IF NOT EXISTS document_signatures_provider_agreement_idx
  ON public.document_signatures (provider_agreement_id);

-- 2. One row per required signer. A document is executed only when every
--    required signer row reaches signed.
CREATE TABLE IF NOT EXISTS public.document_signature_signers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_id uuid NOT NULL REFERENCES public.document_signatures(id) ON DELETE CASCADE,
  application_id uuid NOT NULL,
  offering_document_id uuid NOT NULL,
  offering_id uuid,
  -- Authoritative person and profile; email alone never identifies a signer.
  signer_user_id uuid,
  investment_profile_id uuid,
  signer_email text NOT NULL,
  signer_name text NOT NULL,
  signer_capacity text NOT NULL DEFAULT 'individual',
  signing_order integer NOT NULL DEFAULT 1,
  required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending',
  provider_signer_id text,
  provider_embed_url text,
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS document_signature_signers_unique_idx
  ON public.document_signature_signers (signature_id, lower(signer_email));
CREATE INDEX IF NOT EXISTS document_signature_signers_app_idx
  ON public.document_signature_signers (application_id, offering_document_id);
CREATE INDEX IF NOT EXISTS document_signature_signers_user_idx
  ON public.document_signature_signers (signer_user_id);

GRANT SELECT ON public.document_signature_signers TO authenticated;
GRANT ALL ON public.document_signature_signers TO service_role;

ALTER TABLE public.document_signature_signers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signers readable by the investor who owns the application"
  ON public.document_signature_signers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.investor_applications a
      WHERE a.id = document_signature_signers.application_id
        AND a.user_id = auth.uid()
    )
    OR signer_user_id = auth.uid()
  );

CREATE POLICY "signers readable by Harmonious staff"
  ON public.document_signature_signers FOR SELECT TO authenticated
  USING (public.is_any_staff());

-- Completed signature history is never rewritten.
CREATE OR REPLACE FUNCTION public.protect_completed_signer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'signed' THEN
      RAISE EXCEPTION 'A completed signature cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'signed' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.signed_at IS DISTINCT FROM OLD.signed_at
       OR NEW.signer_user_id IS DISTINCT FROM OLD.signer_user_id
       OR NEW.investment_profile_id IS DISTINCT FROM OLD.investment_profile_id
       OR NEW.signer_capacity IS DISTINCT FROM OLD.signer_capacity
       OR lower(NEW.signer_email) IS DISTINCT FROM lower(OLD.signer_email) THEN
      RAISE EXCEPTION 'A completed signature cannot be rewritten.';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_completed_signer_trg ON public.document_signature_signers;
CREATE TRIGGER protect_completed_signer_trg
  BEFORE UPDATE OR DELETE ON public.document_signature_signers
  FOR EACH ROW EXECUTE FUNCTION public.protect_completed_signer();

-- 3. Webhook idempotency and replay protection for Box deliveries.
CREATE TABLE IF NOT EXISTS public.box_sign_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_id text NOT NULL,
  trigger text,
  sign_request_id text,
  delivered_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  outcome text,
  payload jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS box_sign_webhook_events_unique_idx
  ON public.box_sign_webhook_events (provider_event_id);
CREATE INDEX IF NOT EXISTS box_sign_webhook_events_request_idx
  ON public.box_sign_webhook_events (sign_request_id);

GRANT ALL ON public.box_sign_webhook_events TO service_role;

ALTER TABLE public.box_sign_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook events readable by Harmonious staff"
  ON public.box_sign_webhook_events FOR SELECT TO authenticated
  USING (public.is_any_staff());