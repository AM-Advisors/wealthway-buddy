ALTER TABLE public.bank_statement_uploads ADD COLUMN IF NOT EXISTS entered_manually boolean NOT NULL DEFAULT false;
ALTER TABLE public.bank_statement_uploads ADD COLUMN IF NOT EXISTS entered_by uuid;
ALTER TABLE public.fund_expense_records ADD COLUMN IF NOT EXISTS bill_copy_path text;