DROP POLICY IF EXISTS "authenticated read offering requirements" ON public.offering_requirements;
CREATE POLICY "Staff, fund managers and fund investors read requirements"
ON public.offering_requirements FOR SELECT TO authenticated
USING (
  public.is_any_staff()
  OR public.can_manage_diligence(offering_id)
  OR EXISTS (SELECT 1 FROM public.investor_applications ia
             WHERE ia.offering_id = offering_requirements.offering_id AND ia.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Staff update every intake" ON public.client_fund_intakes;
CREATE POLICY "Staff update every intake"
ON public.client_fund_intakes FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  AND ur.role = ANY (ARRAY['admin','super_admin','legal','compliance','finance','client_success','executive']::public.app_role[])))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  AND ur.role = ANY (ARRAY['admin','super_admin','legal','compliance','finance','client_success','executive']::public.app_role[])));