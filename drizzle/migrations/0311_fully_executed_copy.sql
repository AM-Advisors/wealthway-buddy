ALTER TABLE public.document_signatures ADD COLUMN IF NOT EXISTS executed_pdf_path text, ADD COLUMN IF NOT EXISTS executed_at timestamptz;
COMMENT ON COLUMN public.document_signatures.executed_pdf_path IS 'Fully executed (fund-countersigned) copy; pdf_path keeps the investor-signed copy as history.';
UPDATE public.document_signatures ds SET executed_pdf_path = e.detail->>'countersignedPath', executed_at = s.signed_at
FROM public.offering_document_events e
JOIN public.document_signature_signers s ON s.signature_id = (e.detail->>'signatureId')::uuid AND s.role_key = 'fund_manager' AND s.status = 'signed'
WHERE e.event = 'fund_countersigned' AND ds.id = (e.detail->>'signatureId')::uuid AND ds.executed_pdf_path IS NULL;