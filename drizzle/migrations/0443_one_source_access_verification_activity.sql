-- 1. Client staff: one list
GRANT SELECT ON public.client_team_assignments TO authenticated;
GRANT ALL ON public.client_team_assignments TO service_role;
DROP POLICY IF EXISTS "client team readable by staff" ON public.client_team_assignments;
CREATE POLICY "client team readable by staff" ON public.client_team_assignments
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "client team own assignments" ON public.client_team_assignments;
CREATE POLICY "client team own assignments" ON public.client_team_assignments
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.block_retired_list_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'This list is retired: %', TG_ARGV[0] USING ERRCODE = 'P0001';
END $$;

DROP TRIGGER IF EXISTS client_assignments_retired ON public.client_assignments;
CREATE TRIGGER client_assignments_retired BEFORE INSERT OR UPDATE ON public.client_assignments
  FOR EACH ROW EXECUTE FUNCTION public.block_retired_list_write('client staff are assigned on the client team list');
COMMENT ON TABLE public.client_assignments IS 'DEPRECATED: replaced by client_team_assignments (Sales, Account Manager, Operations). Kept as history; never read.';

-- 2. Staff access: user_roles decides
DROP TRIGGER IF EXISTS access_role_assignments_retired ON public.access_role_assignments;
CREATE TRIGGER access_role_assignments_retired BEFORE INSERT ON public.access_role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.block_retired_list_write('staff roles live in user_roles; client and fund access is added from that client or fund');
COMMENT ON TABLE public.access_role_assignments IS 'DEPRECATED: replaced by user_roles (staff), client_users (client) and fund_managers (fund). Existing rows may only be ended; new rows are refused.';

DROP TRIGGER IF EXISTS staff_capability_grants_retired ON public.staff_capability_grants;
CREATE TRIGGER staff_capability_grants_retired BEFORE INSERT ON public.staff_capability_grants
  FOR EACH ROW EXECUTE FUNCTION public.block_retired_list_write('staff roles live in user_roles');
COMMENT ON TABLE public.staff_capability_grants IS 'DEPRECATED: never used; staff roles live in user_roles.';
DROP TRIGGER IF EXISTS staff_custom_roles_retired ON public.staff_custom_roles;
CREATE TRIGGER staff_custom_roles_retired BEFORE INSERT ON public.staff_custom_roles
  FOR EACH ROW EXECUTE FUNCTION public.block_retired_list_write('staff roles live in user_roles');
COMMENT ON TABLE public.staff_custom_roles IS 'DEPRECATED: never used; staff roles live in user_roles.';

-- 3. One activity timeline (read-only, allowlisted fields only, server-only)
CREATE OR REPLACE VIEW public.activity_timeline WITH (security_invoker = true) AS
  SELECT 'access:' || id AS id, created_at AS occurred_at, 'Access' AS category,
         actor_user_id, target_user_id AS subject_user_id,
         CASE WHEN scope_type = 'fund' THEN scope_id END AS offering_id,
         CASE WHEN scope_type = 'client' THEN scope_id END AS client_id,
         replace(action, '_', ' ') || CASE WHEN outcome = 'denied' THEN ' (refused)' ELSE '' END AS summary
    FROM public.access_audit_events
  UNION ALL
  SELECT 'user-access:' || id, created_at, 'Access', actor_id,
         CASE WHEN subject_kind = 'user' THEN subject_id END,
         CASE WHEN scope IN ('fund', 'fund_invitations') THEN scope_id END,
         CASE WHEN scope IN ('client', 'client_contacts', 'client_invitations') THEN scope_id END,
         replace(action, '_', ' ')
    FROM public.user_access_events
  UNION ALL
  SELECT 'role:' || id, created_at, 'Staff role', actor_id, target_user_id, NULL::uuid, NULL::uuid,
         replace(action, '_', ' ') || ' ' || replace(role, '_', ' ')
    FROM public.staff_role_events
  UNION ALL
  SELECT 'team-new:' || id, created_at, 'Client team', changed_by, new_user_id, offering_id, client_id,
         'Assigned as ' || replace(team_role, '_', ' ')
    FROM public.team_assignment_events WHERE new_user_id IS NOT NULL
  UNION ALL
  SELECT 'team-prior:' || id, created_at, 'Client team', changed_by, prior_user_id, offering_id, client_id,
         'Removed as ' || replace(team_role, '_', ' ')
    FROM public.team_assignment_events WHERE prior_user_id IS NOT NULL
  UNION ALL
  SELECT 'id-check:' || id, created_at, 'Verification', actor_user_id, user_id, NULL::uuid, NULL::uuid,
         'ID check ' || replace(coalesce(to_status, event), '_', ' ')
    FROM public.account_identity_check_events
  UNION ALL
  SELECT 'fund-access:' || id, created_at, 'Fund access', actor_user_id, NULL::uuid, offering_id, NULL::uuid,
         replace(event, '_', ' ') || coalesce(' ' || replace(after_role, '_', ' '), '')
    FROM public.fund_team_grant_events
  UNION ALL
  SELECT 'review:' || id, created_at, 'Review', actor_id, NULL::uuid, offering_id, NULL::uuid,
         coalesce(replace(area, '_', ' ') || ': ', '') || replace(action, '_', ' ') || coalesce(' (' || outcome || ')', '')
    FROM public.reviewer_activity
  UNION ALL
  SELECT 'client-menu:' || id, created_at, 'Client menu', actor_id, NULL::uuid, NULL::uuid, client_id,
         CASE WHEN enabled THEN 'Turned on ' ELSE 'Turned off ' END || replace(tab_key, '_', ' ')
    FROM public.client_tab_access_events
  UNION ALL
  SELECT 'investor-record:' || id, created_at, 'Investor record', actor_user_id, NULL::uuid, offering_id, NULL::uuid,
         'Changed ' || replace(field, '_', ' ')
    FROM public.investor_record_changes;

REVOKE ALL ON public.activity_timeline FROM anon, authenticated;
GRANT SELECT ON public.activity_timeline TO service_role;
COMMENT ON VIEW public.activity_timeline IS 'One read-only activity timeline across access, role, team, verification, fund access, review, client menu and investor record history. Allowlisted fields only; server-only.';