CREATE TABLE public.investor_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.investor_applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  doc_kind text NOT NULL,
  note text,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX investor_documents_application_idx ON public.investor_documents (application_id, uploaded_at DESC);
CREATE INDEX investor_documents_offering_idx ON public.investor_documents (offering_id);

GRANT SELECT, INSERT, DELETE ON public.investor_documents TO authenticated;
GRANT ALL ON public.investor_documents TO service_role;

ALTER TABLE public.investor_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Investors add their own uploads"
ON public.investor_documents FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.investor_applications a
    WHERE a.id = application_id AND a.user_id = auth.uid() AND a.offering_id = investor_documents.offering_id
  )
);

CREATE POLICY "Investors read their own uploads"
ON public.investor_documents FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Investors remove their own uploads"
ON public.investor_documents FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins read every upload"
ON public.investor_documents FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Assigned managers read uploads for their funds"
ON public.investor_documents FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.fund_managers fm
    WHERE fm.offering_id = investor_documents.offering_id AND fm.user_id = auth.uid()
  )
);