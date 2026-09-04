DROP POLICY IF EXISTS "funds readable by permitted users" ON public.offerings;
CREATE POLICY "funds readable by permitted users" ON public.offerings
FOR SELECT TO authenticated
USING (
  reg_type = '506c'::reg_type
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = offerings.id AND fm.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.investor_fund_access ia WHERE ia.offering_id = offerings.id AND ia.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.investor_applications a WHERE a.offering_id = offerings.id AND a.user_id = auth.uid())
);