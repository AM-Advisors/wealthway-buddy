CREATE OR REPLACE VIEW public.activity_timeline WITH (security_invoker = true) AS
  SELECT 'access:' || id AS id, created_at AS occurred_at, 'Access' AS category,
         actor_user_id, target_user_id AS subject_user_id,
         CASE WHEN scope_type = 'fund' THEN scope_id END AS offering_id,
         CASE WHEN scope_type = 'client' THEN scope_id END AS client_id,
         translate(action, '_.', '  ') || CASE WHEN outcome = 'denied' THEN ' (refused)' ELSE '' END AS summary
    FROM public.access_audit_events
  UNION ALL
  SELECT 'user-access:' || id, created_at, 'Access', actor_id,
         CASE WHEN subject_kind = 'user' THEN subject_id END,
         CASE WHEN scope IN ('fund', 'fund_invitations') THEN scope_id END,
         CASE WHEN scope IN ('client', 'client_contacts', 'client_invitations') THEN scope_id END,
         translate(action, '_.', '  ')
    FROM public.user_access_events
  UNION ALL
  SELECT 'role:' || id, created_at, 'Staff role', actor_id, target_user_id, NULL::uuid, NULL::uuid,
         translate(action, '_.', '  ') || ' ' || translate(role, '_.', '  ')
    FROM public.staff_role_events
  UNION ALL
  SELECT 'team-new:' || id, created_at, 'Client team', changed_by, new_user_id, offering_id, client_id,
         'Assigned as ' || translate(team_role, '_', ' ')
    FROM public.team_assignment_events WHERE new_user_id IS NOT NULL
  UNION ALL
  SELECT 'team-prior:' || id, created_at, 'Client team', changed_by, prior_user_id, offering_id, client_id,
         'Removed as ' || translate(team_role, '_', ' ')
    FROM public.team_assignment_events WHERE prior_user_id IS NOT NULL
  UNION ALL
  SELECT 'id-check:' || id, created_at, 'Verification', actor_user_id, user_id, NULL::uuid, NULL::uuid,
         'ID check ' || translate(coalesce(to_status, event), '_.', '  ')
    FROM public.account_identity_check_events
  UNION ALL
  SELECT 'fund-access:' || id, created_at, 'Fund access', actor_user_id, NULL::uuid, offering_id, NULL::uuid,
         translate(event, '_.', '  ') || coalesce(' ' || translate(after_role, '_', ' '), '')
    FROM public.fund_team_grant_events
  UNION ALL
  SELECT 'review:' || id, created_at, 'Review', actor_id, NULL::uuid, offering_id, NULL::uuid,
         coalesce(translate(area, '_.', '  ') || ': ', '') || translate(action, '_.', '  ') || coalesce(' (' || outcome || ')', '')
    FROM public.reviewer_activity
  UNION ALL
  SELECT 'client-menu:' || id, created_at, 'Client menu', actor_id, NULL::uuid, NULL::uuid, client_id,
         CASE WHEN enabled THEN 'Turned on ' ELSE 'Turned off ' END || translate(tab_key, '_', ' ')
    FROM public.client_tab_access_events
  UNION ALL
  SELECT 'investor-record:' || id, created_at, 'Investor record', actor_user_id, NULL::uuid, offering_id, NULL::uuid,
         CASE field
           WHEN 'added_to_fund' THEN 'Added to fund'
           WHEN 'removed_from_fund' THEN 'Removed from fund'
           ELSE 'Changed ' || translate(regexp_replace(field, '_cents$', ''), '_', ' ')
         END
    FROM public.investor_record_changes;

REVOKE ALL ON public.activity_timeline FROM anon, authenticated;
GRANT SELECT ON public.activity_timeline TO service_role;