CREATE TABLE public.diligence_request_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.diligence_rooms(id) ON DELETE SET NULL,
  prompt text NOT NULL,
  guidance text,
  category text NOT NULL DEFAULT 'general',
  is_required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.diligence_question_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.diligence_request_questions(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  investor_user_id uuid NOT NULL,
  assigned_by uuid NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT 'assigned',
  answered_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, investor_user_id)
);

CREATE TABLE public.diligence_question_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.diligence_question_assignments(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.diligence_request_questions(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  author_name text,
  from_reviewer boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_drq_offering ON public.diligence_request_questions(offering_id, sort_order);
CREATE INDEX idx_dqa_offering ON public.diligence_question_assignments(offering_id);
CREATE INDEX idx_dqa_investor ON public.diligence_question_assignments(investor_user_id);
CREATE INDEX idx_dqr_assignment ON public.diligence_question_responses(assignment_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diligence_request_questions TO authenticated;
GRANT ALL ON public.diligence_request_questions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diligence_question_assignments TO authenticated;
GRANT ALL ON public.diligence_question_assignments TO service_role;
GRANT SELECT, INSERT ON public.diligence_question_responses TO authenticated;
GRANT ALL ON public.diligence_question_responses TO service_role;

ALTER TABLE public.diligence_request_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diligence_question_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diligence_question_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage diligence questions"
ON public.diligence_request_questions FOR ALL TO authenticated
USING (public.can_manage_diligence(offering_id))
WITH CHECK (public.can_manage_diligence(offering_id));

CREATE POLICY "Investors read questions assigned to them"
ON public.diligence_request_questions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.diligence_question_assignments a
  WHERE a.question_id = diligence_request_questions.id
    AND a.investor_user_id = auth.uid()
));

CREATE POLICY "Managers manage question assignments"
ON public.diligence_question_assignments FOR ALL TO authenticated
USING (public.can_manage_diligence(offering_id))
WITH CHECK (public.can_manage_diligence(offering_id));

CREATE POLICY "Investors read their assignments"
ON public.diligence_question_assignments FOR SELECT TO authenticated
USING (investor_user_id = auth.uid());

CREATE POLICY "Investors mark their assignments answered"
ON public.diligence_question_assignments FOR UPDATE TO authenticated
USING (investor_user_id = auth.uid())
WITH CHECK (investor_user_id = auth.uid());

CREATE POLICY "Managers read answer trail"
ON public.diligence_question_responses FOR SELECT TO authenticated
USING (public.can_manage_diligence(offering_id));

CREATE POLICY "Managers add to answer trail"
ON public.diligence_question_responses FOR INSERT TO authenticated
WITH CHECK (public.can_manage_diligence(offering_id) AND author_id = auth.uid());

CREATE POLICY "Investors read their answer trail"
ON public.diligence_question_responses FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.diligence_question_assignments a
  WHERE a.id = diligence_question_responses.assignment_id
    AND a.investor_user_id = auth.uid()
));

CREATE POLICY "Investors answer their assignments"
ON public.diligence_question_responses FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND from_reviewer = false
  AND EXISTS (
    SELECT 1 FROM public.diligence_question_assignments a
    WHERE a.id = diligence_question_responses.assignment_id
      AND a.investor_user_id = auth.uid()
  )
);

CREATE TRIGGER set_drq_updated_at BEFORE UPDATE ON public.diligence_request_questions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_dqa_updated_at BEFORE UPDATE ON public.diligence_question_assignments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();