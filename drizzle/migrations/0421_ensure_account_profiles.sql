CREATE OR REPLACE FUNCTION public.ensure_account_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NULLIF(lower(btrim(NEW.email)), ''))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_account_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_ensure_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_ensure_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.ensure_account_profile();

INSERT INTO public.profiles (user_id, email)
SELECT u.id, NULLIF(lower(btrim(u.email)), '')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;