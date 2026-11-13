-- Doug Mangrum's Roas Hedge LP investment closed in October. On Nov 13 he
-- pressed "Start investing" on the old invitation card, which opened a second,
-- empty draft (no investing party, no signatures, no money). Remove only that
-- draft from the Fund, the same way "Remove from Fund" does, keeping the record
-- and its history. Guarded so it does nothing if the draft has moved on.
DO $$
DECLARE
  stray constant uuid := 'f902acdd-9969-4b97-b340-aa68a1f78652';
  original constant uuid := '13071da2-781b-4b30-97e1-d3d47177cb34';
  r record;
BEGIN
  SELECT o.* INTO r FROM public.investor_onboardings o
  WHERE o.id = stray
    AND o.stage = 'started'
    AND o.removed_at IS NULL
    AND o.investment_profile_id IS NULL
    AND o.position_id IS NULL
    AND o.accepted_amount_cents IS NULL
    AND o.commitment_amount_cents IS NULL
    AND COALESCE(o.funded_amount_cents, 0) = 0
    AND EXISTS (
      SELECT 1 FROM public.investor_onboardings c
      WHERE c.id = original AND c.stage = 'closed' AND c.removed_at IS NULL
        AND c.offering_id = o.offering_id AND c.investor_user_id = o.investor_user_id
        AND c.invitation_id = o.invitation_id
    );
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.investor_onboardings
  SET removed_at = now(),
      removal_reason = 'Duplicate draft opened from the invitation card after the investment closed; the closed investment remains the current record.',
      stage = 'cancelled',
      last_activity_at = now()
  WHERE id = stray;

  INSERT INTO public.investor_record_changes
    (offering_id, onboarding_id, subject_table, subject_id, field, old_value, new_value, source, actor_user_id, manager_visible)
  VALUES
    (r.offering_id, stray, 'investor_onboardings', stray, 'removed_from_fund', to_jsonb(r.stage::text), to_jsonb('removed'::text), 'harmonious_correction', NULL, true);

  INSERT INTO public.investor_onboarding_events
    (onboarding_id, offering_id, event, from_status, to_status, detail, actor_role)
  VALUES
    (stray, r.offering_id, 'investor_removed_from_fund', r.stage, 'cancelled',
     jsonb_build_object('reason', 'duplicate_after_closed_investment', 'keptOnboardingId', original::text), 'harmonious');

  UPDATE public.investment_readiness_tasks
  SET status = 'resolved', resolved_at = now()
  WHERE onboarding_id = stray AND status = 'open';

  UPDATE public.onboarding_readiness_summaries
  SET terminal = 'cancelled', close_ready = false, blocked = false, next_owner = NULL, computed_at = now()
  WHERE onboarding_id = stray;
END $$;