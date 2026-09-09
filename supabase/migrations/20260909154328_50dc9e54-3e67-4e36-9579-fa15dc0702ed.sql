CREATE POLICY "Managers manage closing files"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'closing-documents'
  AND public.can_manage_diligence(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'closing-documents'
  AND public.can_manage_diligence(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Investors read their own closing files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'closing-documents'
  AND EXISTS (
    SELECT 1 FROM public.investor_applications a
    WHERE a.id = ((storage.foldername(name))[2])::uuid
      AND a.user_id = auth.uid()
  )
);