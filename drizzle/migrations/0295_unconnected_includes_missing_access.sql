CREATE OR REPLACE FUNCTION public.list_unconnected_account_ids(_limit int DEFAULT 200)
RETURNS TABLE(user_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT DISTINCT u.id FROM auth.users u
  WHERE u.email_confirmed_at IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.persons p WHERE p.user_id IS NULL AND p.merged_into_person_id IS NULL AND lower(p.email) = lower(u.email))
    OR EXISTS (SELECT 1 FROM public.fund_invitations fi WHERE fi.status = 'pending' AND lower(fi.email) = lower(u.email) AND (fi.expires_at IS NULL OR fi.expires_at > now()))
    OR EXISTS (SELECT 1 FROM public.investor_onboardings io JOIN public.persons p ON p.id = io.person_id
               WHERE io.investor_user_id IS NULL AND io.removed_at IS NULL AND p.user_id = u.id)
    OR EXISTS (SELECT 1 FROM public.investor_onboardings io WHERE io.investor_user_id = u.id AND io.removed_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM public.investor_fund_access a WHERE a.user_id = u.id AND a.offering_id = io.offering_id))
  )
  LIMIT greatest(1, least(_limit, 1000))
$$;
REVOKE ALL ON FUNCTION public.list_unconnected_account_ids(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_unconnected_account_ids(int) TO service_role;