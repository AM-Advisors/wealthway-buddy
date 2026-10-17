ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS payment_methods text[] NOT NULL DEFAULT ARRAY['wire']::text[],
  ADD COLUMN IF NOT EXISTS check_payable_to text,
  ADD COLUMN IF NOT EXISTS check_mail_address text;
ALTER TABLE public.offerings DROP CONSTRAINT IF EXISTS offerings_payment_methods_valid;
ALTER TABLE public.offerings ADD CONSTRAINT offerings_payment_methods_valid
  CHECK (cardinality(payment_methods) >= 1 AND payment_methods <@ ARRAY['wire','ach','check']::text[]);