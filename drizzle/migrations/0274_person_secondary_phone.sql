ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS secondary_phone text;
ALTER TABLE public.persons ADD CONSTRAINT persons_secondary_phone_format CHECK (secondary_phone IS NULL OR secondary_phone ~ '^\+[1-9][0-9]{7,14}$');
COMMENT ON COLUMN public.persons.secondary_phone IS 'Optional secondary contact phone, E.164; contact-only, not an authentication or SMS code destination.';
GRANT SELECT (secondary_phone) ON public.persons TO authenticated;
GRANT ALL ON public.persons TO service_role;