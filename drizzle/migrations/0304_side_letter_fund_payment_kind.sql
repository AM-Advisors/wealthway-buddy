ALTER TABLE public.fund_payments DROP CONSTRAINT fund_payments_kind_check;
ALTER TABLE public.fund_payments ADD CONSTRAINT fund_payments_kind_check CHECK (kind = ANY (ARRAY['new_fund_request'::text, 'service_request'::text, 'side_letter'::text]));
ALTER TABLE public.side_letters ADD COLUMN IF NOT EXISTS fee_payment_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS side_letters_fee_payment_unique ON public.side_letters (fee_payment_id) WHERE fee_payment_id IS NOT NULL;