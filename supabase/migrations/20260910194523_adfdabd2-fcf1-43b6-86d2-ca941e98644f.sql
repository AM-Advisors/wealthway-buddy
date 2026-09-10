CREATE TABLE IF NOT EXISTS public.staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role public.app_role NOT NULL,
  invited_name text,
  invited_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_invitations TO authenticated;
GRANT ALL ON public.staff_invitations TO service_role;

ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff invitations admin" ON public.staff_invitations;
CREATE POLICY "staff invitations admin" ON public.staff_invitations
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role)
      OR private.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role)
      OR private.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP TRIGGER IF EXISTS staff_invitations_updated ON public.staff_invitations;
CREATE TRIGGER staff_invitations_updated BEFORE UPDATE ON public.staff_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS staff_invitations_pending_key
  ON public.staff_invitations (lower(email), role) WHERE status = 'pending';

-- Roles a Harmonious administrator may grant from the console.
CREATE OR REPLACE FUNCTION private.grantable_staff_role(_role public.app_role)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _role::text IN ('admin','operations','legal','compliance','fund_administration',
                         'tax','finance','client_success','executive')
$$;

CREATE OR REPLACE FUNCTION public.list_staff_accounts()
RETURNS TABLE(user_id uuid, email text, legal_name text, roles text[], last_sign_in_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'admin'::public.app_role)
       OR private.has_role(auth.uid(), 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Only an administrator can see the Harmonious team list.';
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

CREATE OR REPLACE FUNCTION public.set_staff_role(_user_id uuid, _role public.app_role, _grant boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'admin'::public.app_role)
       OR private.has_role(auth.uid(), 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Only an administrator can change Harmonious team access.';
  END IF;
  IF NOT private.grantable_staff_role(_role) THEN
    RAISE EXCEPTION 'That role cannot be granted from the console.';
  END IF;
  IF _user_id = auth.uid() AND _role = 'admin'::public.app_role AND NOT _grant THEN
    RAISE EXCEPTION 'You cannot remove your own administrator access.';
  END IF;

  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
  END IF;

  INSERT INTO public.contract_audit_events (actor_id, actor_role, area, action, target, new_value)
  VALUES (auth.uid(), 'staff', 'team access', CASE WHEN _grant THEN 'granted' ELSE 'removed' END,
          _role::text, jsonb_build_object('user_id', _user_id, 'role', _role::text));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_staff_accounts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_staff_role(uuid, public.app_role, boolean) FROM anon;

-- Apply pending staff invitations when the invited person confirms their email.
CREATE OR REPLACE FUNCTION public.sync_roles_and_invitations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := lower(COALESCE(NEW.email, ''));
  inv RECORD;
BEGIN
  IF NEW.email_confirmed_at IS NULL OR v_email = '' THEN
    RETURN NEW;
  END IF;

  IF split_part(v_email, '@', 2) = 'harmonious.co' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = NEW.id AND role = 'admin'::public.app_role;
  END IF;

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
$function$;