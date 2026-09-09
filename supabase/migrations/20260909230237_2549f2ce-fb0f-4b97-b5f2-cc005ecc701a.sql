DROP POLICY IF EXISTS "Fund managers read approved tax documents" ON public.fund_tax_documents;

CREATE POLICY "Fund managers read their fund tax documents"
ON public.fund_tax_documents
FOR SELECT
TO authenticated
USING (public.can_manage_diligence(offering_id));

CREATE POLICY "Fund managers add their fund tax documents"
ON public.fund_tax_documents
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_diligence(offering_id) AND uploaded_by = auth.uid());

CREATE POLICY "Fund managers remove their pending uploads"
ON public.fund_tax_documents
FOR DELETE
TO authenticated
USING (
  public.can_manage_diligence(offering_id)
  AND uploaded_by = auth.uid()
  AND review_status = 'pending'
);