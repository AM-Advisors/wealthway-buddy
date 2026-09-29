ALTER TABLE public.offering_documents
  ADD COLUMN IF NOT EXISTS document_category text,
  ADD COLUMN IF NOT EXISTS usage text,
  ADD COLUMN IF NOT EXISTS applicability jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS active_version integer;

ALTER TABLE public.offering_documents
  ADD CONSTRAINT offering_documents_category_chk CHECK (document_category IS NULL OR document_category IN ('operating_agreement','subscription_agreement','ppm','other')),
  ADD CONSTRAINT offering_documents_usage_chk CHECK (usage IS NULL OR usage IN ('reference','acknowledgment','signature'));

ALTER TABLE public.offering_document_versions
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'uploaded_review_required',
  ADD COLUMN IF NOT EXISTS effective_date date,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS signing_config jsonb,
  ADD COLUMN IF NOT EXISTS signing_config_status text NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS signing_config_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS signing_config_confirmed_at timestamptz;

ALTER TABLE public.offering_document_versions
  ADD CONSTRAINT odv_approval_status_chk CHECK (approval_status IN ('uploaded_review_required','approved','superseded')),
  ADD CONSTRAINT odv_signing_config_status_chk CHECK (signing_config_status IN ('not_configured','needs_review','confirmed'));

CREATE TABLE public.offering_document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  offering_document_id uuid REFERENCES public.offering_documents(id) ON DELETE SET NULL,
  version integer,
  event text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.offering_document_events TO service_role;
ALTER TABLE public.offering_document_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX offering_document_events_doc_idx ON public.offering_document_events(offering_document_id, created_at);

CREATE TABLE public.investment_document_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL REFERENCES public.investor_onboardings(id) ON DELETE CASCADE,
  offering_document_id uuid NOT NULL REFERENCES public.offering_documents(id) ON DELETE CASCADE,
  version integer NOT NULL,
  acknowledged_by uuid NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (onboarding_id, offering_document_id, version)
);
GRANT ALL ON public.investment_document_acknowledgments TO service_role;
ALTER TABLE public.investment_document_acknowledgments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_offering_document_record_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'This record is append-only';
END $$;
CREATE TRIGGER offering_document_events_append_only BEFORE UPDATE OR DELETE ON public.offering_document_events
  FOR EACH ROW EXECUTE FUNCTION public.block_offering_document_record_mutation();
CREATE TRIGGER investment_document_acks_append_only BEFORE UPDATE OR DELETE ON public.investment_document_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION public.block_offering_document_record_mutation();