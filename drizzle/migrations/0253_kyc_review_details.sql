ALTER TABLE public.account_identity_checks ADD COLUMN IF NOT EXISTS review_details jsonb;
ALTER TABLE public.kyc_verifications ADD COLUMN IF NOT EXISTS review_details jsonb;