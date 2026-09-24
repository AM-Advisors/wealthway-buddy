CREATE TABLE public.investor_prep_field_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.investor_prep_drafts(id),
  onboarding_id uuid NOT NULL,
  field_key text NOT NULL,
  action text NOT NULL CHECK (action IN ('confirm','correct')),
  prepared_value jsonb,
  previous_value jsonb,
  new_value jsonb,
  prepared_by_capacity text NOT NULL,
  material boolean NOT NULL DEFAULT false,
  affected_requirements text[] NOT NULL DEFAULT '{}',
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.investor_prep_field_reviews (onboarding_id, field_key, created_at);
GRANT SELECT ON public.investor_prep_field_reviews TO authenticated;
GRANT ALL ON public.investor_prep_field_reviews TO service_role;
ALTER TABLE public.investor_prep_field_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read field reviews" ON public.investor_prep_field_reviews FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE TABLE public.investor_document_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL,
  offering_id uuid NOT NULL,
  document_id uuid NOT NULL,
  version integer NOT NULL,
  template_ref text NOT NULL,
  profile_fingerprint text NOT NULL,
  merge_values jsonb NOT NULL,
  merge_sources jsonb NOT NULL,
  signing_mode text NOT NULL,
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','reviewed','sent_for_signature','stale','superseded')),
  reviewed_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (onboarding_id, document_id, version)
);
GRANT SELECT ON public.investor_document_snapshots TO authenticated;
GRANT ALL ON public.investor_document_snapshots TO service_role;
ALTER TABLE public.investor_document_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read doc snapshots" ON public.investor_document_snapshots FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE OR REPLACE FUNCTION public.block_prep_review_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Field review history is append-only'; END $$;
CREATE TRIGGER prep_reviews_append_only BEFORE UPDATE OR DELETE ON public.investor_prep_field_reviews FOR EACH ROW EXECUTE FUNCTION public.block_prep_review_mutation();

CREATE OR REPLACE FUNCTION public.protect_doc_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Document snapshots are kept in history'; END IF;
  IF NEW.merge_values IS DISTINCT FROM OLD.merge_values OR NEW.template_ref IS DISTINCT FROM OLD.template_ref
     OR NEW.version IS DISTINCT FROM OLD.version OR NEW.profile_fingerprint IS DISTINCT FROM OLD.profile_fingerprint THEN
    RAISE EXCEPTION 'Document snapshot contents are immutable; regenerate instead';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER doc_snapshot_protect BEFORE UPDATE OR DELETE ON public.investor_document_snapshots FOR EACH ROW EXECUTE FUNCTION public.protect_doc_snapshot();