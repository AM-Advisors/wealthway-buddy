CREATE TABLE public.manager_onboarding_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  doc_type text NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'submitted',
  review_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manager_onboarding_documents TO authenticated;
GRANT ALL ON public.manager_onboarding_documents TO service_role;

ALTER TABLE public.manager_onboarding_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers see their own submissions"
  ON public.manager_onboarding_documents FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Managers add their own submissions"
  ON public.manager_onboarding_documents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Managers withdraw pending submissions"
  ON public.manager_onboarding_documents FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status = 'submitted');

CREATE POLICY "Admins review submissions"
  ON public.manager_onboarding_documents FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER manager_onboarding_documents_updated
  BEFORE UPDATE ON public.manager_onboarding_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX manager_onboarding_documents_user_idx
  ON public.manager_onboarding_documents (user_id, created_at DESC);

CREATE POLICY "Managers upload their own onboarding files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'manager-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Managers read their own onboarding files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'manager-uploads'
    AND ((storage.foldername(name))[1] = auth.uid()::text
         OR private.has_role(auth.uid(), 'admin'::public.app_role))
  );

CREATE POLICY "Managers delete their own onboarding files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'manager-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);