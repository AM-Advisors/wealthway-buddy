CREATE TABLE public.star_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id text NOT NULL UNIQUE,
  ccm_control_id text,
  domain_code text NOT NULL,
  question text NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  imported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.star_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id text NOT NULL,
  answer text CHECK (answer IN ('yes','no','na')),
  responsibility text CHECK (responsibility IN ('csp','csc','shared')),
  explanation text,
  control_keys text[] NOT NULL DEFAULT '{}',
  evidence_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL CHECK (status IN ('draft','approved')),
  approves_id uuid REFERENCES public.star_answers(id),
  created_by uuid NOT NULL,
  self_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX star_answers_q ON public.star_answers(question_id, created_at DESC);
CREATE TABLE public.star_assessment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL CHECK (action IN ('owner_set','submitted','registry_url')),
  value text,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.star_questions, public.star_answers, public.star_assessment_events TO service_role;
ALTER TABLE public.star_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.star_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.star_assessment_events ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_star_history_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'STAR answers and events are append-only'; END $$;
CREATE TRIGGER star_answers_append_only BEFORE UPDATE OR DELETE ON public.star_answers FOR EACH ROW EXECUTE FUNCTION public.block_star_history_mutation();
CREATE TRIGGER star_events_append_only BEFORE UPDATE OR DELETE ON public.star_assessment_events FOR EACH ROW EXECUTE FUNCTION public.block_star_history_mutation();