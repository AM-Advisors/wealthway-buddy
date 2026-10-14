ALTER TABLE public.investor_onboardings ADD COLUMN IF NOT EXISTS questionnaire_source text CHECK (questionnaire_source IN ('harmonious','didit'));
ALTER TABLE public.investor_onboardings ADD COLUMN IF NOT EXISTS questionnaire_didit_session_id text;
ALTER TABLE public.investor_onboardings ADD COLUMN IF NOT EXISTS questionnaire_submitted_at timestamptz;
COMMENT ON COLUMN public.investor_onboardings.questionnaire_didit_session_id IS 'Didit session the questionnaire answers came from or are linked to (the investor''s latest identity session).';