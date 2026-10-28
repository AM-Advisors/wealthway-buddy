-- Allow staff/manager uploads for investors who have not claimed a login yet.
-- The document must still match the exact onboarding, investing profile, fund and person.
CREATE OR REPLACE FUNCTION public.guard_investor_profile_document()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.investment_profile_id IS NOT NULL THEN
    IF NEW.prepared_for_person_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.investor_onboardings o
        WHERE o.id = NEW.onboarding_id
          AND o.investor_user_id IS NULL
          AND o.person_id = NEW.prepared_for_person_id
          AND o.investment_profile_id = NEW.investment_profile_id
          AND o.offering_id = NEW.offering_id
      ) OR NOT EXISTS (SELECT 1 FROM public.investment_profiles p WHERE p.id = NEW.investment_profile_id) THEN
        RAISE EXCEPTION 'Document must belong to the investor and investing profile';
      END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM public.investment_profiles p WHERE p.id = NEW.investment_profile_id AND p.owner_user_id = NEW.user_id) OR NOT EXISTS (SELECT 1 FROM public.investor_onboardings o WHERE o.id = NEW.onboarding_id AND o.investor_user_id = NEW.user_id AND o.investment_profile_id = NEW.investment_profile_id AND o.offering_id = NEW.offering_id) THEN
      RAISE EXCEPTION 'Document must belong to the investor and investing profile';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.investment_profile_id IS NOT NULL THEN
    IF ROW(NEW.investment_profile_id,NEW.user_id,NEW.onboarding_id,NEW.offering_id,NEW.storage_path,NEW.doc_kind,NEW.file_name) IS DISTINCT FROM ROW(OLD.investment_profile_id,OLD.user_id,OLD.onboarding_id,OLD.offering_id,OLD.storage_path,OLD.doc_kind,OLD.file_name) THEN
      RAISE EXCEPTION 'Profile document originals cannot be replaced; upload a new version';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' AND OLD.investment_profile_id IS NOT NULL THEN
    RAISE EXCEPTION 'Profile documents are retained; upload an updated version';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $function$;