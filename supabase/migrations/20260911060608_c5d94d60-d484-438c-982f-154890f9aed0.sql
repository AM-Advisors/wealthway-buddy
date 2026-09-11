ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS matched_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_matched_by uuid,
  ADD COLUMN IF NOT EXISTS invoice_matched_at timestamptz;

CREATE INDEX IF NOT EXISTS bank_transactions_matched_invoice_idx
  ON public.bank_transactions (matched_invoice_id);