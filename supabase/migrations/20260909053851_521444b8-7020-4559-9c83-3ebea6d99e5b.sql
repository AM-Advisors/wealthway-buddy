ALTER TABLE public.offering_documents
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint;

CREATE POLICY "Reviewers upload fund document files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'offering-files'
    AND (
      private.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.fund_managers fm
        WHERE fm.user_id = auth.uid()
          AND fm.offering_id::text = (storage.foldername(name))[1]
      )
    )
  );

CREATE POLICY "Fund people read fund document files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'offering-files'
    AND (
      private.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.fund_managers fm
        WHERE fm.user_id = auth.uid()
          AND fm.offering_id::text = (storage.foldername(name))[1]
      )
      OR EXISTS (
        SELECT 1 FROM public.investor_applications a
        WHERE a.user_id = auth.uid()
          AND a.offering_id::text = (storage.foldername(name))[1]
      )
      OR EXISTS (
        SELECT 1 FROM public.investor_fund_access f
        WHERE f.user_id = auth.uid()
          AND f.offering_id::text = (storage.foldername(name))[1]
      )
    )
  );

CREATE POLICY "Reviewers remove fund document files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'offering-files'
    AND (
      private.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.fund_managers fm
        WHERE fm.user_id = auth.uid()
          AND fm.offering_id::text = (storage.foldername(name))[1]
      )
    )
  );