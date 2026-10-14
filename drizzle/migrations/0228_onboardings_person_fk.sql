ALTER TABLE public.investor_onboardings ADD CONSTRAINT investor_onboardings_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.persons(id) ON DELETE SET NULL;
NOTIFY pgrst, 'reload schema';