-- Future-only projection: no backfill, account-to-person approval, or history rewrite.
-- Runs in the existing authorized person-write transaction, including audit inserts.
CREATE OR REPLACE FUNCTION public.sync_exact_person_application_checks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  linked record;
BEGIN
  IF NEW.merged_into_person_id IS NOT NULL THEN RETURN NEW; END IF;
  FOR linked IN
    SELECT a.id, a.kyc_status, a.aml_status, o.id AS onboarding_id, o.offering_id
    FROM public.investor_onboardings o
    JOIN public.investor_applications a ON a.id = o.application_id AND a.offering_id = o.offering_id
    WHERE o.person_id = NEW.id AND o.removed_at IS NULL AND o.closed_at IS NULL
      AND o.stage NOT IN ('closed', 'declined', 'cancelled')
      AND (SELECT count(*) FROM public.investor_onboardings x
           WHERE x.application_id = a.id AND x.removed_at IS NULL) = 1
    FOR UPDATE OF a
  LOOP
    IF NEW.kyc_status IS DISTINCT FROM OLD.kyc_status AND linked.kyc_status IS DISTINCT FROM NEW.kyc_status THEN
      UPDATE public.investor_applications SET kyc_status = NEW.kyc_status, updated_at = now() WHERE id = linked.id;
      INSERT INTO public.investor_record_changes
        (offering_id, onboarding_id, subject_table, subject_id, field, old_value, new_value, source, actor_user_id, manager_visible)
      VALUES (linked.offering_id, linked.onboarding_id, 'investor_applications', linked.id, 'kyc_status',
        to_jsonb(linked.kyc_status), to_jsonb(NEW.kyc_status), 'canonical_person_sync', auth.uid(), true);
    END IF;
    IF NEW.aml_status IS DISTINCT FROM OLD.aml_status AND linked.aml_status IS DISTINCT FROM NEW.aml_status THEN
      UPDATE public.investor_applications SET aml_status = NEW.aml_status, updated_at = now() WHERE id = linked.id;
      INSERT INTO public.investor_record_changes
        (offering_id, onboarding_id, subject_table, subject_id, field, old_value, new_value, source, actor_user_id, manager_visible)
      VALUES (linked.offering_id, linked.onboarding_id, 'investor_applications', linked.id, 'aml_status',
        to_jsonb(linked.aml_status), to_jsonb(NEW.aml_status), 'canonical_person_sync', auth.uid(), true);
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_exact_person_application_checks() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER exact_person_application_checks_forward
AFTER UPDATE OF kyc_status, aml_status ON public.persons
FOR EACH ROW WHEN (OLD.kyc_status IS DISTINCT FROM NEW.kyc_status OR OLD.aml_status IS DISTINCT FROM NEW.aml_status)
EXECUTE FUNCTION public.sync_exact_person_application_checks();