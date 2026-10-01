CREATE TABLE public.fund_team_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('investor_invitation','investor_message','document_send')),
  title text NOT NULL,
  recipient_email text,
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','used','returned','withdrawn')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fund_team_drafts TO authenticated;
GRANT ALL ON public.fund_team_drafts TO service_role;
ALTER TABLE public.fund_team_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authors read own drafts" ON public.fund_team_drafts FOR SELECT TO authenticated USING (author_user_id = auth.uid());
CREATE POLICY "Managers read their fund drafts" ON public.fund_team_drafts FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = fund_team_drafts.offering_id AND fm.user_id = auth.uid()));