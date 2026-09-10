CREATE POLICY "Staff read payment documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'payment-documents' AND private.is_staff(auth.uid()));

CREATE POLICY "Staff upload payment documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'payment-documents' AND private.is_staff(auth.uid()));

CREATE POLICY "Staff update payment documents"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'payment-documents' AND private.is_staff(auth.uid()))
WITH CHECK (bucket_id = 'payment-documents' AND private.is_staff(auth.uid()));