ALTER TABLE public.offerings ADD COLUMN IF NOT EXISTS arbitration_city text, ADD COLUMN IF NOT EXISTS arbitration_state text;
COMMENT ON COLUMN public.offerings.arbitration_city IS 'City where disputes are arbitrated (Subscription Agreement).';
COMMENT ON COLUMN public.offerings.arbitration_state IS 'State where disputes are arbitrated; falls back to state formed.';