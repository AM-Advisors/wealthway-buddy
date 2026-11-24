CREATE OR REPLACE FUNCTION public.sync_relationship_verification_from_person() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.kyc_status = 'approved' AND NEW.aml_status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.kyc_status IS DISTINCT FROM NEW.kyc_status OR OLD.aml_status IS DISTINCT FROM NEW.aml_status) THEN
    INSERT INTO public.investor_record_changes (offering_id, onboarding_id, subject_table, subject_id, field, old_value, new_value, source, actor_user_id, manager_visible)
    SELECT ob.offering_id, ob.id, 'investment_profile_relationships', r.id, 'verification_status', to_jsonb(r.verification_status), to_jsonb('approved (from person''s own ID check)'::text), 'system', NULL, true
    FROM public.investment_profile_relationships r
    LEFT JOIN public.investor_onboardings ob ON ob.investment_profile_id = r.profile_id AND ob.removed_at IS NULL
    WHERE r.person_id = NEW.id AND r.status <> 'removed' AND r.verification_status IS DISTINCT FROM 'approved';
    UPDATE public.investment_profile_relationships SET verification_status = 'approved'
    WHERE person_id = NEW.id AND status <> 'removed' AND verification_status IS DISTINCT FROM 'approved';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.sync_relationship_verification_from_person() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER persons_sync_relationship_verification AFTER INSERT OR UPDATE OF kyc_status, aml_status ON public.persons
FOR EACH ROW EXECUTE FUNCTION public.sync_relationship_verification_from_person();
UPDATE public.investment_profile_relationships r SET verification_status = 'approved'
FROM public.persons p WHERE p.id = r.person_id AND p.kyc_status = 'approved' AND p.aml_status = 'approved' AND r.status <> 'removed' AND r.verification_status IS DISTINCT FROM 'approved';