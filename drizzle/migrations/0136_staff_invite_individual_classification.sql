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

  FOR inv IN
    SELECT * FROM public.staff_invitations
    WHERE lower(email) = v_email AND status = 'pending' AND expires_at > now()
  LOOP
    -- Staff invitations go to a named person: record the Individual classification
    -- that privileged Harmonious roles require, before granting the role.
    IF public.current_account_classification(NEW.id) IS DISTINCT FROM 'individual' THEN
      INSERT INTO public.access_account_classifications (user_id, classification, reason, recorded_by)
      VALUES (NEW.id, 'individual', 'Accepted personal staff invitation', inv.invited_by);
    END IF;

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
$function$;