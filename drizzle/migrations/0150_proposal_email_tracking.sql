ALTER TABLE public.marketing_email_events ADD COLUMN IF NOT EXISTS sales_document_id uuid;
CREATE INDEX IF NOT EXISTS marketing_email_events_doc_idx ON public.marketing_email_events(sales_document_id);
ALTER TABLE public.sales_documents ADD COLUMN IF NOT EXISTS sent_to text;