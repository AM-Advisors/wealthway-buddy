ALTER TYPE public.journal_status ADD VALUE IF NOT EXISTS 'voided';
ALTER TABLE public.fund_expense_records ADD COLUMN IF NOT EXISTS vendor_status text NOT NULL DEFAULT 'stated';
ALTER TABLE public.fund_expense_records ADD COLUMN IF NOT EXISTS vendor_note text;
COMMENT ON COLUMN public.fund_expense_records.vendor_status IS 'stated | verified | unknown - unknown means the vendor field holds a source description, not a verified counterparty';