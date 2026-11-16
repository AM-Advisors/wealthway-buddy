-- Dinesh Kanawade (Roas Hedge LP) was approved to fund on Nov 16, 2026, but
-- re-confirming his signer afterwards moved him back to review. Return him to
-- awaiting funds so his Fund step opens. Skipped unless he is still approved,
-- released, unfunded, live and in review.
DO $$
DECLARE
  ob public.investor_onboardings%ROWTYPE;
BEGIN
  SELECT * INTO ob FROM public.investor_onboardings
  WHERE id = 'c99e93a6-cd0b-488b-92e0-8114694fb9d5'
    AND stage = 'harmonious_review'
    AND approved_to_fund_at IS NOT NULL
    AND funding_released_at IS NOT NULL
    AND funding_status = 'not_funded'
    AND removed_at IS NULL
    AND merged_into_onboarding_id IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.investor_onboardings SET stage = 'awaiting_funds', updated_at = now() WHERE id = ob.id;

  INSERT INTO public.investor_record_changes
    (offering_id, onboarding_id, subject_table, subject_id, field, old_value, new_value, source, actor_user_id, manager_visible)
  VALUES
    (ob.offering_id, ob.id, 'investor_onboardings', ob.id, 'stage',
     to_jsonb(ob.stage), to_jsonb('awaiting_funds'::text), 'harmonious_correction', NULL, false);
END $$;
