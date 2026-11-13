ALTER TABLE public.offerings ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE public.offerings ADD CONSTRAINT offerings_contact_phone_len CHECK (contact_phone IS NULL OR char_length(contact_phone) <= 40);
COMMENT ON COLUMN public.offerings.contact_phone IS 'Fund contact phone shown in fund documents; falls back to the fund signatory phone when blank.';