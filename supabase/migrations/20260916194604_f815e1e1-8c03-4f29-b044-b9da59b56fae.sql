CREATE TABLE public.compliance_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.investor_applications(id) ON DELETE CASCADE,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  check_kind text NOT NULL CHECK (check_kind IN ('kyc','aml','accreditation','documents')),
  action text NOT NULL CHECK (action IN ('submitted','approved','declined','info_requested','document_added')),
  actor_id uuid,
  actor_role text NOT NULL DEFAULT 'investor',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX compliance_submissions_application_idx ON public.compliance_submissions (application_id, created_at DESC);
CREATE INDEX compliance_submissions_offering_idx ON public.compliance_submissions (offering_id, created_at DESC);

GRANT SELECT, INSERT ON public.compliance_submissions TO authenticated;
GRANT ALL ON public.compliance_submissions TO service_role;

ALTER TABLE public.compliance_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Investors read their own submissions"
ON public.compliance_submissions FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins read all submissions"
ON public.compliance_submissions FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers read submissions for their funds"
ON public.compliance_submissions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.fund_managers fm
  WHERE fm.offering_id = compliance_submissions.offering_id
    AND fm.user_id = auth.uid()
));

CREATE POLICY "Participants add submissions"
ON public.compliance_submissions FOR INSERT TO authenticated
WITH CHECK (
  actor_id = auth.uid()
  AND (
    user_id = auth.uid()
    OR private.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.fund_managers fm
      WHERE fm.offering_id = compliance_submissions.offering_id
        AND fm.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Staff upload investor evidence"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'investor-uploads'
  AND (
    private.has_role(auth.uid(), 'admin')
    OR private.has_role(auth.uid(), 'fund_manager')
  )
);