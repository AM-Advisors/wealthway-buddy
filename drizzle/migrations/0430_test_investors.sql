ALTER TABLE public.investor_onboardings ADD COLUMN IF NOT EXISTS is_test_investor boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_harmonious_email(_email text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(lower(btrim(_email)) LIKE '%@harmonious.co', false)
$$;

CREATE OR REPLACE FUNCTION public.onboarding_is_derived_test(_person uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.persons p WHERE _person IS NOT NULL AND p.id = _person AND (public.is_harmonious_email(p.email) OR p.is_test_demo IS TRUE))
      OR EXISTS (SELECT 1 FROM public.profiles r WHERE _user IS NOT NULL AND r.user_id = _user AND (public.is_harmonious_email(r.email) OR r.is_test_demo IS TRUE))
$$;
REVOKE EXECUTE ON FUNCTION public.onboarding_is_derived_test(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.investor_onboarding_test_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.onboarding_is_derived_test(NEW.person_id, NEW.investor_user_id) THEN
    NEW.is_test_investor := true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_investor_onboarding_test_flag ON public.investor_onboardings;
CREATE TRIGGER trg_investor_onboarding_test_flag
  BEFORE INSERT OR UPDATE OF person_id, investor_user_id, is_test_investor ON public.investor_onboardings
  FOR EACH ROW EXECUTE FUNCTION public.investor_onboarding_test_flag();

CREATE OR REPLACE FUNCTION public.person_test_flag_propagate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_harmonious_email(NEW.email) OR NEW.is_test_demo IS TRUE THEN
    UPDATE public.investor_onboardings SET is_test_investor = true WHERE person_id = NEW.id AND is_test_investor = false;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.profile_test_flag_propagate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_harmonious_email(NEW.email) OR NEW.is_test_demo IS TRUE THEN
    UPDATE public.investor_onboardings SET is_test_investor = true WHERE investor_user_id = NEW.user_id AND is_test_investor = false;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_person_test_flag_propagate ON public.persons;
CREATE TRIGGER trg_person_test_flag_propagate
  AFTER INSERT OR UPDATE OF email, is_test_demo ON public.persons
  FOR EACH ROW EXECUTE FUNCTION public.person_test_flag_propagate();

DROP TRIGGER IF EXISTS trg_profile_test_flag_propagate ON public.profiles;
CREATE TRIGGER trg_profile_test_flag_propagate
  AFTER INSERT OR UPDATE OF email, is_test_demo ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profile_test_flag_propagate();

UPDATE public.investor_onboardings o SET is_test_investor = true
WHERE o.is_test_investor = false AND public.onboarding_is_derived_test(o.person_id, o.investor_user_id);