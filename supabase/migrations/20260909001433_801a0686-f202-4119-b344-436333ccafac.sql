CREATE POLICY "Investors upload own files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'investor-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Investors read own files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'investor-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Investors delete own files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'investor-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Admins read investor uploads"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'investor-uploads' AND private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Managers read investor uploads for their funds"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'investor-uploads'
  AND EXISTS (
    SELECT 1
    FROM public.investor_documents d
    JOIN public.fund_managers fm ON fm.offering_id = d.offering_id
    WHERE d.storage_path = storage.objects.name AND fm.user_id = auth.uid()
  )
);