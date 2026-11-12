-- Closing an investment was meant to record the commitment and the settled
-- contribution in the commitment ledger, but used an event type the ledger
-- does not accept, so neither row was saved. Record exactly the rows the close
-- step would have written, from the closed onboarding itself. Additive only;
-- existing ledger rows are never changed.
INSERT INTO public.commitment_events
  (position_id, offering_id, event_type, amount_cents, effective_date, source, source_ref, dedupe_key, reason, recorded_by)
SELECT o.position_id, o.offering_id, 'original_commitment',
       COALESCE(o.closed_amount_cents, o.accepted_amount_cents),
       COALESCE(p.admitted_on, (o.closed_at AT TIME ZONE 'UTC')::date),
       'investor_onboarding', o.id::text, 'onboarding:' || o.id || ':commitment',
       'Recorded from the closed investment: the closing step did not save its commitment entry.',
       o.closed_by
FROM public.investor_onboardings o
JOIN public.investor_positions p ON p.id = o.position_id
WHERE o.stage = 'closed'
  AND COALESCE(o.closed_amount_cents, o.accepted_amount_cents, 0) > 0
  AND NOT EXISTS (SELECT 1 FROM public.commitment_events e
                  WHERE e.position_id = o.position_id AND e.event_type = 'original_commitment')
ON CONFLICT (position_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

INSERT INTO public.commitment_events
  (position_id, offering_id, event_type, amount_cents, effective_date, source, source_ref, dedupe_key, reason, recorded_by)
SELECT o.position_id, o.offering_id, 'contribution', o.funded_amount_cents,
       COALESCE(p.admitted_on, (o.closed_at AT TIME ZONE 'UTC')::date),
       'investor_onboarding', o.id::text, 'onboarding:' || o.id || ':contribution',
       'Recorded from the closed investment: the closing step did not save its contribution entry.',
       o.closed_by
FROM public.investor_onboardings o
JOIN public.investor_positions p ON p.id = o.position_id
WHERE o.stage = 'closed'
  AND o.funded_amount_cents > 0
  AND NOT EXISTS (SELECT 1 FROM public.commitment_events e
                  WHERE e.position_id = o.position_id
                    AND e.event_type IN ('contribution', 'contribution_settled'))
ON CONFLICT (position_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;