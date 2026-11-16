-- Late October, the older portal page opened an empty application for three
-- Roas Hedge LP investors who already had an investment record. Mark only those
-- empty rows Withdrawn (kept for history, never deleted), log the correction on
-- the investor's real investment, and keep the automatic status-change notice
-- from emailing anyone. Each row is skipped unless it is still empty.
DO $$
DECLARE
  pair record;
  app public.investor_applications%ROWTYPE;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('4f877a1a-bf06-458d-b336-ffb43daedb25'::uuid, '13071da2-781b-4b30-97e1-d3d47177cb34'::uuid),
      ('850c255f-8793-49df-ba8e-d76cdca855ce'::uuid, 'd1db8028-b5f9-4376-8e74-f1fae1fafc49'::uuid),
      ('a9e883c4-2c66-4307-bd8a-f86a4d323f3a'::uuid, 'abd41c5a-0d70-445c-9fb7-ba8bbe5e4252'::uuid)
    ) AS t(app_id, onboarding_id)
  LOOP
    SELECT a.* INTO app FROM public.investor_applications a
    WHERE a.id = pair.app_id
      AND a.status = 'in_progress'
      AND a.submitted_at IS NULL
      AND a.commitment_cents IS NULL
      AND EXISTS (
        SELECT 1 FROM public.investor_onboardings o
        WHERE o.id = pair.onboarding_id
          AND o.investor_user_id = a.user_id
          AND o.offering_id = a.offering_id
          AND o.removed_at IS NULL
          AND o.merged_into_onboarding_id IS NULL
          AND o.stage NOT IN ('cancelled', 'declined')
          AND o.application_id IS DISTINCT FROM a.id
      )
      AND NOT EXISTS (SELECT 1 FROM public.investor_onboardings x WHERE x.application_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM public.document_signatures x WHERE x.application_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM public.investor_documents x WHERE x.application_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM public.accreditation_records x WHERE x.application_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM public.accreditation_documents x WHERE x.application_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM public.payments x WHERE x.application_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM public.wire_confirmations x WHERE x.application_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM public.wire_requests x WHERE x.application_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM public.investor_positions x WHERE x.application_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM public.investor_cap_positions x WHERE x.application_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM public.subscriptions x WHERE x.application_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM public.capital_accounts x WHERE x.application_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM public.bank_transactions x WHERE x.matched_application_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM public.journal_lines x WHERE x.application_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM public.funding_acknowledgements x WHERE x.application_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM public.investor_signoffs x WHERE x.application_id = a.id)
    FOR UPDATE;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    UPDATE public.investor_applications SET status = 'withdrawn' WHERE id = app.id;

    INSERT INTO public.investor_record_changes
      (offering_id, onboarding_id, subject_table, subject_id, field, old_value, new_value, source, actor_user_id, manager_visible)
    VALUES
      (app.offering_id, pair.onboarding_id, 'investor_applications', app.id, 'status',
       to_jsonb(app.status), to_jsonb('withdrawn'::text), 'harmonious_correction', NULL, false);

    -- The status trigger queues a fund-manager alert; this housekeeping
    -- change is not news to anyone, so mark it handled without emailing.
    UPDATE public.notification_events
    SET sent_at = now(), error = 'Not emailed: empty duplicate application withdrawn by Harmonious correction'
    WHERE application_id = app.id
      AND event_kind = 'status_changed'
      AND field = 'status'
      AND new_value = 'withdrawn'
      AND sent_at IS NULL;
  END LOOP;
END $$;