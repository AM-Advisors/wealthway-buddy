-- Person records fell behind approved login identity checks because the write-back only ran for
-- investments still at the verification step. Bring them in line once: identity status, blank
-- date of birth, blank email (same confirmed login, unused elsewhere). Never overwrites values,
-- never overturns a declined person, skips merged records and superseded checks. Logged, no emails.
DO $$
DECLARE
  r record;
  v_kyc boolean;
  v_dob date;
  v_email text;
  v_at timestamptz;
  v_fields text[];
BEGIN
  FOR r IN
    SELECT c.id AS check_id, c.user_id AS check_user_id, c.session_id, c.decided_at, c.updated_at AS check_updated_at,
           c.review_details->'idDocument'->>'dateOfBirth' AS id_dob,
           p.id AS person_id, p.kyc_status::text AS kyc_status, p.date_of_birth, p.email, p.secondary_email,
           p.user_id AS person_user_id, p.onboarding_state, p.kyc_verified_at, p.identity_verified_at,
           u.email AS login_email, u.email_confirmed_at
    FROM public.account_identity_checks c
    JOIN public.persons p ON p.id = c.person_id
    LEFT JOIN auth.users u ON u.id = c.user_id
    WHERE c.status = 'approved'
      AND p.merged_into_person_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.account_identity_checks c2
        WHERE c2.user_id = c.user_id AND c2.created_at > c.created_at)
      AND (p.kyc_status::text IN ('not_started', 'pending', 'review')
           OR p.date_of_birth IS NULL
           OR p.email IS NULL OR btrim(p.email) = '')
    FOR UPDATE OF p
  LOOP
    v_fields := ARRAY[]::text[];
    v_at := coalesce(r.decided_at, r.check_updated_at, now());
    v_kyc := r.kyc_status IN ('not_started', 'pending', 'review');

    v_dob := NULL;
    IF r.date_of_birth IS NULL AND r.id_dob ~ '^\d{4}-\d{2}-\d{2}' THEN
      BEGIN
        v_dob := left(r.id_dob, 10)::date;
      EXCEPTION WHEN others THEN
        v_dob := NULL;
      END;
    END IF;

    v_email := NULL;
    IF (r.email IS NULL OR btrim(r.email) = '')
       AND r.login_email IS NOT NULL AND btrim(r.login_email) <> ''
       AND r.email_confirmed_at IS NOT NULL
       AND r.person_user_id IS NOT NULL AND r.person_user_id = r.check_user_id
       AND lower(coalesce(r.secondary_email, '')) <> lower(btrim(r.login_email))
       AND NOT EXISTS (
         SELECT 1 FROM public.persons o
         WHERE o.id <> r.person_id AND lower(btrim(o.email)) = lower(btrim(r.login_email))) THEN
      v_email := lower(btrim(r.login_email));
    END IF;

    IF NOT v_kyc AND v_dob IS NULL AND v_email IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.persons SET
      kyc_status = CASE WHEN v_kyc THEN 'approved'::public.check_status ELSE kyc_status END,
      kyc_verified_at = CASE WHEN v_kyc THEN coalesce(kyc_verified_at, v_at) ELSE kyc_verified_at END,
      identity_verified_at = CASE WHEN v_kyc THEN coalesce(identity_verified_at, v_at) ELSE identity_verified_at END,
      date_of_birth = coalesce(date_of_birth, v_dob),
      email = CASE WHEN v_email IS NOT NULL THEN v_email ELSE email END,
      updated_at = now()
    WHERE id = r.person_id;

    IF v_kyc THEN
      v_fields := array_append(v_fields, 'kyc_status');
      INSERT INTO public.investor_record_changes
        (offering_id, onboarding_id, subject_table, subject_id, field, old_value, new_value, source, actor_user_id, manager_visible)
      VALUES (NULL, NULL, 'persons', r.person_id, 'kyc_status', to_jsonb(r.kyc_status), to_jsonb('approved'::text), 'harmonious_correction', NULL, false);
    END IF;
    IF v_dob IS NOT NULL THEN
      v_fields := array_append(v_fields, 'date_of_birth');
      INSERT INTO public.investor_record_changes
        (offering_id, onboarding_id, subject_table, subject_id, field, old_value, new_value, source, actor_user_id, manager_visible)
      VALUES (NULL, NULL, 'persons', r.person_id, 'date_of_birth', 'null'::jsonb, to_jsonb(v_dob::text), 'harmonious_correction', NULL, false);
    END IF;
    IF v_email IS NOT NULL THEN
      v_fields := array_append(v_fields, 'email');
      INSERT INTO public.investor_record_changes
        (offering_id, onboarding_id, subject_table, subject_id, field, old_value, new_value, source, actor_user_id, manager_visible)
      VALUES (NULL, NULL, 'persons', r.person_id, 'email', to_jsonb(r.email), to_jsonb(v_email), 'harmonious_correction', NULL, false);
    END IF;

    INSERT INTO public.person_onboarding_events
      (person_id, from_state, to_state, actor_kind, actor_user_id, reason, detail)
    VALUES (r.person_id, r.onboarding_state, r.onboarding_state, 'system', NULL,
      'Person record brought in line with the approved identity check',
      jsonb_build_object('check_id', r.check_id, 'session', r.session_id, 'fields', to_jsonb(v_fields)));
  END LOOP;
END $$;

-- Dinesh Kanawade (Roas Hedge LP): point the investment at his approved identity check.
-- The older linked check stays on file. Skipped unless it is still the older one.
DO $$
DECLARE
  ob record;
BEGIN
  SELECT o.id, o.offering_id, o.person_id, o.questionnaire_didit_session_id INTO ob
  FROM public.investor_onboardings o
  WHERE o.id = 'c99e93a6-cd0b-488b-92e0-8114694fb9d5'
    AND o.person_id = 'b78d967f-212f-4f42-84d5-7ba1173f2b25'
    AND o.questionnaire_didit_session_id = 'c068820a-8a4d-4ef0-807e-db3438aaa98e'
    AND o.removed_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.account_identity_checks c
      WHERE c.person_id = o.person_id AND c.status = 'approved'
        AND c.session_id = '84c04d98-892d-4469-b429-06c2d6a3aeb6');
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.investor_onboardings
  SET questionnaire_didit_session_id = '84c04d98-892d-4469-b429-06c2d6a3aeb6', updated_at = now()
  WHERE id = ob.id;

  INSERT INTO public.investor_record_changes
    (offering_id, onboarding_id, subject_table, subject_id, field, old_value, new_value, source, actor_user_id, manager_visible)
  VALUES (ob.offering_id, ob.id, 'investor_onboardings', ob.id, 'questionnaire_didit_session_id',
    to_jsonb(ob.questionnaire_didit_session_id), to_jsonb('84c04d98-892d-4469-b429-06c2d6a3aeb6'::text), 'harmonious_correction', NULL, false);
END $$;