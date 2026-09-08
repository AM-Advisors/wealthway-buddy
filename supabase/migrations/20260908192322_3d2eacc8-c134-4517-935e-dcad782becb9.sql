ALTER TABLE public.kyc_verifications ADD COLUMN IF NOT EXISTS didit_user_id text;
CREATE INDEX IF NOT EXISTS kyc_verifications_didit_user_id_idx ON public.kyc_verifications (didit_user_id);
CREATE INDEX IF NOT EXISTS kyc_verifications_session_id_idx ON public.kyc_verifications (session_id);
CREATE INDEX IF NOT EXISTS kyc_verifications_inquiry_id_idx ON public.kyc_verifications (inquiry_id);