GRANT SELECT ON public.fund_record_sync_items TO authenticated;
CREATE POLICY "Staff read investor sync items" ON public.fund_record_sync_items
  FOR SELECT TO authenticated USING (public.is_any_staff());