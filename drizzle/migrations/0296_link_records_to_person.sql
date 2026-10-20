ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL;
ALTER TABLE public.cap_stakeholders ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL;
ALTER TABLE public.ct_stakeholders ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS profiles_person_id_idx ON public.profiles(person_id);
CREATE INDEX IF NOT EXISTS crm_contacts_person_id_idx ON public.crm_contacts(person_id);
CREATE INDEX IF NOT EXISTS cap_stakeholders_person_id_idx ON public.cap_stakeholders(person_id);
CREATE INDEX IF NOT EXISTS ct_stakeholders_person_id_idx ON public.ct_stakeholders(person_id);

-- One canonical person per email, only when exactly one live person has it.
CREATE OR REPLACE FUNCTION public.unique_person_for_email(_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN count(*) = 1 THEN min(id::text)::uuid END
  FROM public.persons WHERE merged_into_person_id IS NULL AND lower(email) = lower(trim(_email)) AND coalesce(trim(_email), '') <> ''
$$;
REVOKE ALL ON FUNCTION public.unique_person_for_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unique_person_for_email(text) TO service_role;

-- Backfill: accounts by their own person record; others by a single exact email match.
UPDATE public.profiles pr SET person_id = p.id FROM public.persons p
  WHERE pr.person_id IS NULL AND p.user_id = pr.user_id AND p.merged_into_person_id IS NULL;
UPDATE public.ct_stakeholders s SET person_id = p.id FROM public.persons p
  WHERE s.person_id IS NULL AND s.user_id IS NOT NULL AND p.user_id = s.user_id AND p.merged_into_person_id IS NULL;
UPDATE public.ct_stakeholders s SET person_id = public.unique_person_for_email(s.email) WHERE s.person_id IS NULL AND s.email IS NOT NULL;
UPDATE public.cap_stakeholders s SET person_id = public.unique_person_for_email(s.email) WHERE s.person_id IS NULL AND s.email IS NOT NULL;
UPDATE public.crm_contacts c SET person_id = public.unique_person_for_email(c.email) WHERE c.person_id IS NULL AND c.email IS NOT NULL;
UPDATE public.client_contacts c SET person_id = public.unique_person_for_email(c.email) WHERE c.person_id IS NULL AND c.email IS NOT NULL;

-- Keep new and changed rows linked automatically.
CREATE OR REPLACE FUNCTION public.link_person_by_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.person_id IS NULL AND NEW.email IS NOT NULL THEN
    NEW.person_id := public.unique_person_for_email(NEW.email);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crm_contacts_link_person ON public.crm_contacts;
CREATE TRIGGER crm_contacts_link_person BEFORE INSERT OR UPDATE OF email ON public.crm_contacts FOR EACH ROW EXECUTE FUNCTION public.link_person_by_email();
DROP TRIGGER IF EXISTS cap_stakeholders_link_person ON public.cap_stakeholders;
CREATE TRIGGER cap_stakeholders_link_person BEFORE INSERT OR UPDATE OF email ON public.cap_stakeholders FOR EACH ROW EXECUTE FUNCTION public.link_person_by_email();
DROP TRIGGER IF EXISTS ct_stakeholders_link_person ON public.ct_stakeholders;
CREATE TRIGGER ct_stakeholders_link_person BEFORE INSERT OR UPDATE OF email ON public.ct_stakeholders FOR EACH ROW EXECUTE FUNCTION public.link_person_by_email();
DROP TRIGGER IF EXISTS client_contacts_link_person ON public.client_contacts;
CREATE TRIGGER client_contacts_link_person BEFORE INSERT OR UPDATE OF email ON public.client_contacts FOR EACH ROW EXECUTE FUNCTION public.link_person_by_email();

CREATE OR REPLACE FUNCTION public.link_profile_person()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    UPDATE public.profiles SET person_id = NEW.id WHERE user_id = NEW.user_id AND person_id IS NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS persons_link_profile ON public.persons;
CREATE TRIGGER persons_link_profile AFTER INSERT OR UPDATE OF user_id ON public.persons FOR EACH ROW EXECUTE FUNCTION public.link_profile_person();