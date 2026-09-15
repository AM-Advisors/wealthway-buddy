CREATE POLICY "Client contacts read their certificate files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'cap-certificates'
    AND EXISTS (
      SELECT 1 FROM public.client_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.client_id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "Client contacts upload certificate files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cap-certificates'
    AND EXISTS (
      SELECT 1 FROM public.client_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.client_id::text = (storage.foldername(name))[1]
        AND cu.client_role <> 'client_readonly'
    )
  );

CREATE POLICY "Staff read certificate files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'cap-certificates'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = ANY (ARRAY['admin','super_admin','legal','compliance','finance','client_success','executive','operations','fund_administration','tax']::public.app_role[])
    )
  );