CREATE POLICY "staff manage restricted fund setup files" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'fund-formation' AND (storage.foldername(name))[1] = 'fund-setup-restricted' AND private.is_staff(auth.uid()))
WITH CHECK (bucket_id = 'fund-formation' AND (storage.foldername(name))[1] = 'fund-setup-restricted' AND private.is_staff(auth.uid()));