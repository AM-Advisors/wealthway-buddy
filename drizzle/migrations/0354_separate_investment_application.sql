-- Explicit authorized action only; never links by same login/fund or borrows signatures.
CREATE OR REPLACE FUNCTION public.ensure_exact_investment_application(p_onboarding_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  investment public.investor_onboardings%ROWTYPE;
  application public.investor_applications%ROWTYPE;
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT * INTO investment FROM public.investor_onboardings WHERE id=p_onboarding_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Investment not found'; END IF;
  IF investment.investor_user_id IS DISTINCT FROM auth.uid()
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN
    RAISE EXCEPTION 'Investor or investor operations authority required';
  END IF;
  IF investment.removed_at IS NOT NULL OR investment.closed_at IS NOT NULL OR investment.stage IN ('closed','declined','cancelled') THEN
    RAISE EXCEPTION 'This investment can no longer be changed';
  END IF;
  IF investment.investor_user_id IS NULL OR investment.person_id IS NULL OR NOT EXISTS
    (SELECT 1 FROM public.persons WHERE id=investment.person_id AND merged_into_person_id IS NULL) THEN
    RAISE EXCEPTION 'Exact investing person required';
  END IF;
  IF investment.investment_profile_id IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM public.investment_profiles WHERE id=investment.investment_profile_id AND owner_user_id=investment.investor_user_id) THEN
    RAISE EXCEPTION 'Investment profile ownership needs review';
  END IF;
  IF investment.application_id IS NOT NULL THEN
    SELECT * INTO application FROM public.investor_applications WHERE id=investment.application_id;
    IF NOT FOUND OR application.user_id IS DISTINCT FROM investment.investor_user_id OR application.offering_id IS DISTINCT FROM investment.offering_id
      OR EXISTS (SELECT 1 FROM public.investor_onboardings WHERE application_id=investment.application_id AND id<>investment.id) THEN
      RAISE EXCEPTION 'Existing application link needs review';
    END IF;
    RETURN investment.application_id;
  END IF;
  -- New application defaults remain unapproved. Canonical readers use the linked person.
  INSERT INTO public.investor_applications(user_id,offering_id,source,current_step,commitment_cents)
    VALUES (investment.investor_user_id,investment.offering_id,'admin','verification',investment.requested_amount_cents)
    RETURNING id INTO new_id;
  UPDATE public.investor_onboardings SET application_id=new_id,updated_at=now() WHERE id=investment.id;
  INSERT INTO public.investor_record_changes
    (offering_id,onboarding_id,subject_table,subject_id,field,old_value,new_value,source,actor_user_id,manager_visible)
    VALUES (investment.offering_id,investment.id,'investor_onboardings',investment.id,'application_id','null'::jsonb,to_jsonb(new_id),'separate_investment_link',auth.uid(),true);
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.ensure_exact_investment_application(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ensure_exact_investment_application(uuid) TO authenticated;
