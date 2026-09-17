CREATE OR REPLACE FUNCTION public.sync_roles_and_invitations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(COALESCE(NEW.email, ''));
  inv RECORD;
BEGIN
  IF NEW.email_confirmed_at IS NULL OR v_email = '' THEN
    RETURN NEW;
  END IF;

  -- Intentionally no email-domain based role grant or removal here.
  -- Administrator access is granted explicitly through public.set_staff_role().

  FOR inv IN
    SELECT * FROM public.staff_invitations
    WHERE lower(email) = v_email AND status = 'pending' AND expires_at > now()
  LOOP
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, inv.role)
    ON CONFLICT (user_id, role) DO NOTHING;

    UPDATE public.staff_invitations
      SET status = 'accepted', accepted_at = now(), accepted_by = NEW.id
      WHERE id = inv.id;
  END LOOP;

  FOR inv IN
    SELECT * FROM public.client_invitations
    WHERE lower(email) = v_email AND status = 'pending' AND expires_at > now()
  LOOP
    INSERT INTO public.client_users (client_id, user_id, client_role, can_approve)
    VALUES (inv.client_id, NEW.id, inv.client_role, inv.can_approve)
    ON CONFLICT (client_id, user_id) DO UPDATE
      SET client_role = EXCLUDED.client_role, can_approve = EXCLUDED.can_approve;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, inv.client_role::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    UPDATE public.client_invitations
      SET status = 'accepted', accepted_at = now(), accepted_by = NEW.id
      WHERE id = inv.id;
  END LOOP;

  FOR inv IN
    SELECT * FROM public.fund_invitations
    WHERE lower(email) = v_email AND status = 'pending' AND expires_at > now()
  LOOP
    IF inv.role::text = 'operations' THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, inv.role)
      ON CONFLICT (user_id, role) DO NOTHING;
    ELSIF inv.role = 'fund_manager'::public.app_role THEN
      INSERT INTO public.fund_managers (user_id, offering_id, granted_by)
      VALUES (NEW.id, inv.offering_id, inv.invited_by)
      ON CONFLICT (user_id, offering_id) DO NOTHING;
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'fund_manager'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    ELSE
      INSERT INTO public.investor_fund_access (user_id, offering_id, granted_by)
      VALUES (NEW.id, inv.offering_id, inv.invited_by)
      ON CONFLICT (user_id, offering_id) DO NOTHING;
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'investor'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;

    UPDATE public.fund_invitations
      SET status = 'accepted', accepted_at = now(), accepted_by = NEW.id
      WHERE id = inv.id;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_admin_review()
RETURNS TABLE(
  user_id uuid,
  email text,
  legal_name text,
  roles text[],
  company_domain boolean,
  role_granted_at timestamp with time zone,
  last_sign_in_at timestamp with time zone,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'admin'::public.app_role)
       OR private.has_role(auth.uid(), 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Only an administrator can review administrator access.';
  END IF;

  RETURN QUERY
    SELECT u.id,
           u.email::text,
           p.legal_name,
           ARRAY(
             SELECT r2.role::text FROM public.user_roles r2
              WHERE r2.user_id = u.id ORDER BY r2.role::text
           ),
           split_part(lower(COALESCE(u.email, '')), '@', 2) = 'harmonious.co',
           MIN(r.created_at),
           u.last_sign_in_at,
           u.created_at
      FROM auth.users u
      JOIN public.user_roles r
        ON r.user_id = u.id
       AND r.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
      LEFT JOIN public.profiles p ON p.user_id = u.id
     GROUP BY u.id, u.email, p.legal_name, u.last_sign_in_at, u.created_at
     ORDER BY u.email;
END;
$$;

REVOKE ALL ON FUNCTION public.list_admin_review() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_admin_review() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_staff_accounts()
RETURNS TABLE(
  user_id uuid,
  email text,
  legal_name text,
  roles text[],
  last_sign_in_at timestamp with time zone,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'admin'::public.app_role)
       OR private.has_role(auth.uid(), 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Only an administrator can view Harmonious team access.';
  END IF;

  RETURN QUERY
    SELECT u.id,
           u.email::text,
           p.legal_name,
           COALESCE(ARRAY(SELECT r.role::text FROM public.user_roles r WHERE r.user_id = u.id ORDER BY r.role::text), '{}'::text[]),
           u.last_sign_in_at,
           u.created_at
      FROM auth.users u
      LEFT JOIN public.profiles p ON p.user_id = u.id
     WHERE EXISTS (
             SELECT 1 FROM public.user_roles r
              WHERE r.user_id = u.id AND private.grantable_staff_role(r.role)
           )
        OR split_part(lower(u.email), '@', 2) = 'harmonious.co'
     ORDER BY u.email;
END;
$$;

REVOKE ALL ON FUNCTION public.list_staff_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_staff_accounts() TO authenticated;