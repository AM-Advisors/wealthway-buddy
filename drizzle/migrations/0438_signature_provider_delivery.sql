ALTER TABLE public.document_signatures ADD COLUMN IF NOT EXISTS provider_delivery text;
ALTER TABLE public.document_signatures DROP CONSTRAINT IF EXISTS document_signatures_provider_delivery_check;
ALTER TABLE public.document_signatures ADD CONSTRAINT document_signatures_provider_delivery_check CHECK (provider_delivery IS NULL OR provider_delivery IN ('provider_email'));
COMMENT ON COLUMN public.document_signatures.provider_delivery IS 'provider_email when the signing service emails the investor directly; null for in-app signing.';