CREATE TABLE IF NOT EXISTS public.investor_bank_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL,
  investor_user_id uuid NOT NULL,
  institution_name text,
  account_mask text,
  owner_names text[] NOT NULL DEFAULT '{}',
  expected_names text[] NOT NULL DEFAULT '{}',
  name_match boolean NOT NULL,
  status text NOT NULL CHECK (status IN ('verified','name_mismatch')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS investor_bank_verifications_onb ON public.investor_bank_verifications (onboarding_id, created_at DESC);
ALTER TABLE public.investor_bank_verifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.investor_bank_verifications TO authenticated;
GRANT ALL ON public.investor_bank_verifications TO service_role;
CREATE POLICY "investor reads own bank verification" ON public.investor_bank_verifications
  FOR SELECT TO authenticated USING (investor_user_id = auth.uid());
CREATE POLICY "admins read bank verifications" ON public.investor_bank_verifications
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));