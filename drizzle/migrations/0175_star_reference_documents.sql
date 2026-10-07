CREATE TABLE public.star_reference_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.star_reference_documents TO service_role;
ALTER TABLE public.star_reference_documents ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.star_reference_documents IS 'CSA reference guides (STAR Prep Kit). Never Harmonious evidence; server access only.';
ALTER TABLE public.star_assessment_events DROP CONSTRAINT IF EXISTS star_assessment_events_action_check;
ALTER TABLE public.star_assessment_events ADD CONSTRAINT star_assessment_events_action_check CHECK (action = ANY (ARRAY['owner_set','submitted','registry_url','path_chosen','gdpr_done','quality_result']));