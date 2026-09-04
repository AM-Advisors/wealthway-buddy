CREATE POLICY "managers read accreditation files" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'accreditation-docs'
  AND EXISTS (
    SELECT 1 FROM public.investor_applications a
    JOIN public.fund_managers fm ON fm.offering_id = a.offering_id
    WHERE fm.user_id = auth.uid() AND a.user_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "managers read signed documents" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'signed-documents'
  AND EXISTS (
    SELECT 1 FROM public.investor_applications a
    JOIN public.fund_managers fm ON fm.offering_id = a.offering_id
    WHERE fm.user_id = auth.uid() AND a.user_id::text = (storage.foldername(name))[1]
  )
);