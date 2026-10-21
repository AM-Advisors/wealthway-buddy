ALTER TABLE public.sales_quotes ADD COLUMN IF NOT EXISTS offering_id uuid;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_before_issue_on date;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_before_issue_reference text;
COMMENT ON COLUMN public.invoices.paid_before_issue_on IS 'Staff-recorded date a payment was already received outside the platform; applied when the invoice is issued. Record only, no money movement.';