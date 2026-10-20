ALTER TABLE public.investment_profiles ADD COLUMN IF NOT EXISTS tin_fingerprint text;
CREATE INDEX IF NOT EXISTS investment_profiles_tin_fingerprint_idx ON public.investment_profiles(tin_fingerprint) WHERE tin_fingerprint IS NOT NULL;
COMMENT ON COLUMN public.investment_profiles.tin_fingerprint IS 'Keyed HMAC of the tax ID for matching only; never the number itself.';

CREATE OR REPLACE FUNCTION public.find_verified_user_by_email(_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT id FROM auth.users
  WHERE lower(email) = lower(trim(_email)) AND email_confirmed_at IS NOT NULL
  ORDER BY created_at LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.find_verified_user_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_verified_user_by_email(text) TO service_role;

CREATE OR REPLACE FUNCTION public.list_unconnected_account_ids(_limit int DEFAULT 200)
RETURNS TABLE(user_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT DISTINCT u.id FROM auth.users u
  WHERE u.email_confirmed_at IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.persons p WHERE p.user_id IS NULL AND p.merged_into_person_id IS NULL AND lower(p.email) = lower(u.email))
    OR EXISTS (SELECT 1 FROM public.fund_invitations fi WHERE fi.status = 'pending' AND lower(fi.email) = lower(u.email) AND (fi.expires_at IS NULL OR fi.expires_at > now()))
    OR EXISTS (SELECT 1 FROM public.investor_onboardings io JOIN public.persons p ON p.id = io.person_id
               WHERE io.investor_user_id IS NULL AND io.removed_at IS NULL AND p.user_id = u.id)
  )
  LIMIT greatest(1, least(_limit, 1000))
$$;
REVOKE ALL ON FUNCTION public.list_unconnected_account_ids(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_unconnected_account_ids(int) TO service_role;

CREATE OR REPLACE FUNCTION public.profile_tax_ids_missing_fingerprint(_limit int DEFAULT 100)
RETURNS TABLE(profile_id uuid, ciphertext text, iv text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT t.profile_id, t.ciphertext, t.iv FROM private.investment_profile_tax_ids t
  JOIN public.investment_profiles p ON p.id = t.profile_id
  WHERE p.tin_fingerprint IS NULL
  LIMIT greatest(1, least(_limit, 500))
$$;
REVOKE ALL ON FUNCTION public.profile_tax_ids_missing_fingerprint(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profile_tax_ids_missing_fingerprint(int) TO service_role;