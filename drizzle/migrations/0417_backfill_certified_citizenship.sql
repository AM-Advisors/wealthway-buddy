WITH latest AS (
  SELECT DISTINCT ON (io.person_id)
    io.person_id, io.id AS onboarding_id, io.offering_id, c.responder_user_id,
    left(btrim(c.answers->>'citizenship'), 60) AS citizenship
  FROM public.compliance_questionnaire_responses c
  JOIN public.investor_onboardings io ON io.id = c.onboarding_id
  JOIN public.investment_profiles ip ON ip.id = io.investment_profile_id
  WHERE c.kind = 'bsa_aml'
    AND c.superseded_by IS NULL
    AND ip.profile_type = 'individual'
    AND io.person_id IS NOT NULL
    AND coalesce(btrim(c.answers->>'citizenship'), '') <> ''
  ORDER BY io.person_id, c.created_at DESC
),
updated AS (
  UPDATE public.persons p
  SET citizenship_country = l.citizenship, updated_at = now()
  FROM latest l
  WHERE p.id = l.person_id
    AND coalesce(btrim(p.citizenship_country), '') = ''
  RETURNING p.id, l.onboarding_id, l.offering_id, l.responder_user_id, l.citizenship
)
INSERT INTO public.investor_record_changes
  (offering_id, onboarding_id, subject_table, subject_id, field, old_value, new_value, source, actor_user_id, manager_visible)
SELECT offering_id, onboarding_id, 'persons', id, 'citizenship_country', NULL, to_jsonb(citizenship), 'investor', responder_user_id, true
FROM updated;