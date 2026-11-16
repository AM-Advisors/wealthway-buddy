-- Five accounts kept fund access after their investments were cancelled
-- (removal used to leave the access row behind). End only those access rows,
-- audit each one first, and skip any row that is no longer leftover.
DO $$
DECLARE
  target record;
  acc public.investor_fund_access%ROWTYPE;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('c4039df8-54b2-4017-bccb-682814e814ae'::uuid, '1f0e00a9-e95b-436b-916e-26c002e97637'::uuid, 'acb8193f-35fc-41cc-9ee5-629bde3e11b2'::uuid),
      ('4fe169c5-aca8-4405-b99b-484b7856816e'::uuid, 'a6787cec-a886-4b80-9c9d-b4f4ae6ae77e'::uuid, 'fa5ff8b9-e69e-40b9-b9dc-5c6f54d6c88f'::uuid),
      ('3abd36b3-1704-4c60-a014-68309d6cca28'::uuid, '78b2ed26-d531-4dbb-9d8f-7cbe4427626c'::uuid, 'fa5ff8b9-e69e-40b9-b9dc-5c6f54d6c88f'::uuid),
      ('83190c54-f2e2-4dd6-aa07-a77bb827a147'::uuid, 'ece15a02-6917-4e4e-bb5e-3101bb3c40ff'::uuid, '4590531e-197e-4e0d-b1df-81bafb17c2ae'::uuid),
      ('ca59a884-9346-4d85-95de-895ced5850b9'::uuid, '76df567a-a9b0-4c40-b087-5ce404098110'::uuid, 'aea45966-f7da-41c9-8c9d-6e0f08b0cc2e'::uuid)
    ) AS t(access_id, user_id, offering_id)
  LOOP
    SELECT a.* INTO acc FROM public.investor_fund_access a
    WHERE a.id = target.access_id
      AND a.user_id = target.user_id
      AND a.offering_id = target.offering_id
      AND NOT EXISTS (
        SELECT 1 FROM public.investor_onboardings o
        WHERE o.investor_user_id = a.user_id AND o.offering_id = a.offering_id
          AND o.removed_at IS NULL AND o.merged_into_onboarding_id IS NULL
          AND o.stage::text NOT IN ('cancelled', 'declined')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.investor_applications x
        WHERE x.user_id = a.user_id AND x.offering_id = a.offering_id
          AND x.status::text NOT IN ('withdrawn', 'declined', 'rejected', 'cancelled')
      )
      AND NOT EXISTS (SELECT 1 FROM public.fund_file_signatures x WHERE x.signer_user_id = a.user_id AND x.offering_id = a.offering_id)
      AND NOT EXISTS (SELECT 1 FROM public.investor_positions x WHERE x.investor_user_id = a.user_id AND x.offering_id = a.offering_id)
      AND NOT EXISTS (SELECT 1 FROM public.fund_managers x WHERE x.user_id = a.user_id AND x.offering_id = a.offering_id)
    FOR UPDATE;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    INSERT INTO public.access_audit_events
      (actor_user_id, actor_identity, target_user_id, action, outcome, scope_type, scope_id, previous_state, new_state, reason, correlation_id)
    VALUES
      (NULL, 'harmonious_correction', acc.user_id, 'investor_fund_access.revoke', 'applied', 'offering', acc.offering_id,
       to_jsonb(acc), NULL, 'Leftover fund access after the investment was cancelled', 'cleanup:leftover_fund_access');

    DELETE FROM public.investor_fund_access WHERE id = acc.id;
  END LOOP;
END $$;