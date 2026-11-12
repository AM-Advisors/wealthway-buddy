-- 1) The investor portal adopts the application already linked to the
-- investor's exact open investment in a fund (created by
-- ensure_exact_investment_application without an investing account) instead
-- of creating a second application for the same investment. Only the exact
-- link counts: never the oldest same-login/fund application, never a closed,
-- removed or shared link, and only when the investment's investing party
-- matches the account the person is acting as.
CREATE OR REPLACE FUNCTION public.claim_exact_investment_application(p_offering_id uuid, p_persona_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller uuid := auth.uid();
  persona public.investor_personas%ROWTYPE;
  investment public.investor_onboardings%ROWTYPE;
  application public.investor_applications%ROWTYPE;
  profile public.investment_profiles%ROWTYPE;
  open_count int;
  persona_family text;
  profile_family text;
BEGIN
  IF caller IS NULL OR p_offering_id IS NULL OR p_persona_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO persona FROM public.investor_personas WHERE id = p_persona_id AND user_id = caller;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- The account already has its own application in this fund: nothing to claim.
  IF EXISTS (SELECT 1 FROM public.investor_applications
             WHERE user_id = caller AND offering_id = p_offering_id AND persona_id = p_persona_id) THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO open_count FROM public.investor_onboardings
  WHERE investor_user_id = caller AND offering_id = p_offering_id
    AND removed_at IS NULL AND closed_at IS NULL
    AND stage NOT IN ('closed','declined','cancelled');
  IF open_count <> 1 THEN RETURN NULL; END IF;

  SELECT * INTO investment FROM public.investor_onboardings
  WHERE investor_user_id = caller AND offering_id = p_offering_id
    AND removed_at IS NULL AND closed_at IS NULL
    AND stage NOT IN ('closed','declined','cancelled')
  FOR UPDATE;
  IF investment.application_id IS NULL OR investment.investment_profile_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO profile FROM public.investment_profiles WHERE id = investment.investment_profile_id;
  IF NOT FOUND OR profile.owner_user_id IS DISTINCT FROM caller THEN RETURN NULL; END IF;
  IF profile.legacy_persona_id IS NOT NULL THEN
    IF profile.legacy_persona_id <> p_persona_id THEN RETURN NULL; END IF;
  ELSE
    persona_family := persona.kind::text;
    profile_family := CASE profile.profile_type::text
      WHEN 'individual' THEN 'individual' WHEN 'joint' THEN 'joint' WHEN 'trust' THEN 'trust'
      WHEN 'ira' THEN 'ira' WHEN 'retirement_plan' THEN 'ira' ELSE 'entity' END;
    IF persona_family IS DISTINCT FROM profile_family THEN RETURN NULL; END IF;
  END IF;

  SELECT * INTO application FROM public.investor_applications WHERE id = investment.application_id FOR UPDATE;
  IF NOT FOUND OR application.user_id IS DISTINCT FROM caller
     OR application.offering_id IS DISTINCT FROM p_offering_id
     OR application.persona_id IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.investor_onboardings
             WHERE application_id = application.id AND id <> investment.id) THEN
    RETURN NULL;
  END IF;

  UPDATE public.investor_applications SET persona_id = p_persona_id WHERE id = application.id AND persona_id IS NULL;
  INSERT INTO public.investor_record_changes
    (offering_id, onboarding_id, subject_table, subject_id, field, old_value, new_value, source, actor_user_id, manager_visible)
  VALUES (investment.offering_id, investment.id, 'investor_applications', application.id, 'persona_id',
    'null'::jsonb, to_jsonb(p_persona_id), 'exact_investment_claim', caller, false);
  RETURN application.id;
END $$;
REVOKE ALL ON FUNCTION public.claim_exact_investment_application(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_exact_investment_application(uuid, uuid) TO authenticated;

-- 2) One-time correction for the single active investment affected before the
-- safeguard existed (Corps LaaSy). The investor completed his commitment,
-- accreditation attestation and evidence on the portal application, while the
-- fund's investment record pointed at an earlier, empty application. Re-point
-- the investment to the application holding his submitted work. Exact ids and
-- preconditions only; nothing is deleted, the earlier application, its
-- verification session and screening history are retained, and no approval is
-- created. Does nothing where these records do not exist or have changed.
DO $$
DECLARE
  v_onboarding constant uuid := '1ffb5167-b7f2-4857-a78c-43dc7551bfd0';
  v_old_app constant uuid := '6fb55786-3b29-4508-8efb-ff6f1dcd7722';
  v_new_app constant uuid := 'a84fc669-81c3-4847-b4d4-eec035b45a0f';
  v_user constant uuid := '53118962-ed59-4d8a-a5d1-4f09a4dba8cb';
  inv public.investor_onboardings%ROWTYPE;
  app public.investor_applications%ROWTYPE;
  per public.persons%ROWTYPE;
BEGIN
  SELECT * INTO inv FROM public.investor_onboardings WHERE id = v_onboarding FOR UPDATE;
  IF NOT FOUND OR inv.application_id IS DISTINCT FROM v_old_app OR inv.investor_user_id IS DISTINCT FROM v_user
     OR inv.removed_at IS NOT NULL OR inv.closed_at IS NOT NULL OR inv.executed_snapshot IS NOT NULL
     OR inv.signature_id IS NOT NULL OR inv.stage IN ('closed','declined','cancelled') THEN
    RAISE NOTICE 'Investment relink skipped: record absent or already changed';
    RETURN;
  END IF;
  SELECT * INTO app FROM public.investor_applications WHERE id = v_new_app FOR UPDATE;
  IF NOT FOUND OR app.user_id IS DISTINCT FROM v_user OR app.offering_id IS DISTINCT FROM inv.offering_id
     OR app.persona_id IS NULL
     OR EXISTS (SELECT 1 FROM public.investor_onboardings WHERE application_id = v_new_app)
     OR EXISTS (SELECT 1 FROM public.document_signatures WHERE application_id IN (v_old_app, v_new_app))
     OR EXISTS (SELECT 1 FROM public.wire_requests WHERE application_id IN (v_old_app, v_new_app))
     OR EXISTS (SELECT 1 FROM public.payments WHERE application_id IN (v_old_app, v_new_app)) THEN
    RAISE NOTICE 'Investment relink skipped: preconditions not met';
    RETURN;
  END IF;

  UPDATE public.investor_onboardings SET application_id = v_new_app, updated_at = now() WHERE id = v_onboarding;
  INSERT INTO public.investor_record_changes
    (offering_id, onboarding_id, subject_table, subject_id, field, old_value, new_value, source, actor_user_id, manager_visible)
  VALUES (inv.offering_id, inv.id, 'investor_onboardings', inv.id, 'application_id',
    to_jsonb(v_old_app), to_jsonb(v_new_app), 'duplicate_application_relink', NULL, true);

  -- Same projection the person-verification sync performs for exact links.
  SELECT * INTO per FROM public.persons WHERE id = inv.person_id AND merged_into_person_id IS NULL;
  IF FOUND THEN
    IF app.kyc_status IS DISTINCT FROM per.kyc_status THEN
      UPDATE public.investor_applications SET kyc_status = per.kyc_status WHERE id = v_new_app;
      INSERT INTO public.investor_record_changes
        (offering_id, onboarding_id, subject_table, subject_id, field, old_value, new_value, source, actor_user_id, manager_visible)
      VALUES (inv.offering_id, inv.id, 'investor_applications', v_new_app, 'kyc_status',
        to_jsonb(app.kyc_status), to_jsonb(per.kyc_status), 'canonical_person_sync', NULL, true);
    END IF;
    IF app.aml_status IS DISTINCT FROM per.aml_status THEN
      UPDATE public.investor_applications SET aml_status = per.aml_status WHERE id = v_new_app;
      INSERT INTO public.investor_record_changes
        (offering_id, onboarding_id, subject_table, subject_id, field, old_value, new_value, source, actor_user_id, manager_visible)
      VALUES (inv.offering_id, inv.id, 'investor_applications', v_new_app, 'aml_status',
        to_jsonb(app.aml_status), to_jsonb(per.aml_status), 'canonical_person_sync', NULL, true);
    END IF;
    -- These approvals were already reported to the fund for this investment; do not email them twice.
    UPDATE public.notification_events
       SET sent_at = now(),
           error = 'Not sent: the same approval was already reported for this investment',
           metadata = coalesce(metadata, '{}'::jsonb) || '{"suppressed":"duplicate_application_relink"}'::jsonb
     WHERE application_id = v_new_app AND event_kind = 'status_changed'
       AND field IN ('kyc_status','aml_status') AND created_at = now() AND sent_at IS NULL;
  END IF;
END $$;