CREATE TABLE public.prior_doc_signature_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.prior_signed_documents(id),
  onboarding_id uuid NOT NULL,
  offering_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'ai',
  state text NOT NULL,
  expected jsonb NOT NULL DEFAULT '[]'::jsonb,
  found jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing jsonb NOT NULL DEFAULT '[]'::jsonb,
  signed_on date,
  confidence text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  signing_file_id uuid,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.prior_doc_signature_reviews TO service_role;
ALTER TABLE public.prior_doc_signature_reviews ENABLE ROW LEVEL SECURITY;
CREATE INDEX prior_doc_sig_reviews_doc ON public.prior_doc_signature_reviews(document_id, created_at DESC);
CREATE INDEX prior_doc_sig_reviews_onb ON public.prior_doc_signature_reviews(onboarding_id);
CREATE OR REPLACE FUNCTION public.block_prior_doc_sig_review_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Signature reviews are append-only'; END $$;
CREATE TRIGGER prior_doc_sig_reviews_append_only BEFORE UPDATE OR DELETE ON public.prior_doc_signature_reviews
FOR EACH ROW EXECUTE FUNCTION public.block_prior_doc_sig_review_mutation();