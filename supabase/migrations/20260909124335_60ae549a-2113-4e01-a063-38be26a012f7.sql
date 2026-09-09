ALTER TABLE public.investor_documents
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE public.investor_documents
  DROP CONSTRAINT IF EXISTS investor_documents_review_status_check;
ALTER TABLE public.investor_documents
  ADD CONSTRAINT investor_documents_review_status_check
  CHECK (review_status IN ('new','accepted','needs_followup'));

CREATE INDEX IF NOT EXISTS investor_documents_review_idx
  ON public.investor_documents (offering_id, review_status, uploaded_at DESC);

DROP POLICY IF EXISTS "Reviewers update upload review state" ON public.investor_documents;
CREATE POLICY "Reviewers update upload review state"
ON public.investor_documents
FOR UPDATE
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.fund_managers fm
    WHERE fm.offering_id = investor_documents.offering_id AND fm.user_id = auth.uid()
  )
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.fund_managers fm
    WHERE fm.offering_id = investor_documents.offering_id AND fm.user_id = auth.uid()
  )
);