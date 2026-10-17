ALTER TABLE public.offerings ADD COLUMN fund_origin text;
ALTER TABLE public.offerings ADD CONSTRAINT offerings_fund_origin_check CHECK (fund_origin IN ('new','migration'));
ALTER TABLE public.offerings ALTER COLUMN fund_origin SET DEFAULT 'new';
COMMENT ON COLUMN public.offerings.fund_origin IS 'Explicit fund setup origin, independent of vehicle type or imported files. NULL means existing fund awaiting classification; new inserts default to new.';
UPDATE public.offerings SET fund_origin = 'new' WHERE id = 'fa5ff8b9-e69e-40b9-b9dc-5c6f54d6c88f';