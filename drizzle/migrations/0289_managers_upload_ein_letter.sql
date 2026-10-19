CREATE POLICY "fund managers upload own fund EIN letter" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'fund-formation'
  AND (storage.foldername(name))[1] = 'fund-setup-restricted'
  AND (storage.foldername(name))[3] = 'ein-letter'
  AND EXISTS (SELECT 1 FROM public.fund_managers m WHERE m.user_id = auth.uid() AND m.offering_id::text = (storage.foldername(name))[2])
);