ALTER TABLE public.fund_questionnaire_sections ADD COLUMN IF NOT EXISTS source_documents jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE public.fund_questionnaire_ai_state (
 offering_id uuid PRIMARY KEY REFERENCES public.offerings(id),
 blocked_status integer NOT NULL,
 blocked_message text NOT NULL,
 blocked_at timestamptz NOT NULL DEFAULT now(),
 reset_by uuid,
 reset_at timestamptz
);
GRANT ALL ON public.fund_questionnaire_ai_state TO service_role;
REVOKE ALL ON public.fund_questionnaire_ai_state FROM anon, authenticated;
ALTER TABLE public.fund_questionnaire_ai_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_only_question_ai ON public.fund_questionnaire_ai_state FOR ALL TO service_role USING (true) WITH CHECK (true);
ALTER TABLE public.fund_questionnaire_sections ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.fund_questionnaire_sections TO service_role;
CREATE POLICY service_question_sections ON public.fund_questionnaire_sections FOR ALL TO service_role USING (true) WITH CHECK (true);