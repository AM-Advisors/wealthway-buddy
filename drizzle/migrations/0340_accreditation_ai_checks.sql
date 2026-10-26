CREATE TABLE public.accreditation_ai_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  application_id uuid NOT NULL,
  method text,
  verdict text NOT NULL CHECK (verdict IN ('looks_complete','needs_review','mismatch','unavailable')),
  document_kind text,
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  red_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  model text,
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX accreditation_ai_checks_doc_idx ON public.accreditation_ai_checks(document_id, created_at DESC);
CREATE INDEX accreditation_ai_checks_app_idx ON public.accreditation_ai_checks(application_id);
GRANT ALL ON public.accreditation_ai_checks TO service_role;
ALTER TABLE public.accreditation_ai_checks ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_accreditation_ai_check_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'AI accreditation checks are append-only'; END $$;
CREATE TRIGGER accreditation_ai_checks_append_only BEFORE UPDATE OR DELETE ON public.accreditation_ai_checks
FOR EACH ROW EXECUTE FUNCTION public.block_accreditation_ai_check_mutation();