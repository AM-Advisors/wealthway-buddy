CREATE POLICY "managers write docs for their funds"
ON public.offering_documents
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = offering_documents.offering_id AND fm.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = offering_documents.offering_id AND fm.user_id = auth.uid()));