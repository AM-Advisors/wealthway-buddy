CREATE TABLE public.client_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  email text NOT NULL,
  invited_name text,
  client_role text NOT NULL DEFAULT 'client_readonly',
  can_approve boolean NOT NULL DEFAULT false,
  note text,
  invited_by uuid,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  accepted_at timestamptz,
  accepted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_invitations_role_check CHECK (client_role IN ('client_gp','client_signatory','client_finance','client_legal','client_compliance','client_readonly')),
  CONSTRAINT client_invitations_status_check CHECK (status IN ('pending','accepted','cancelled'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_invitations TO authenticated;
GRANT ALL ON public.client_invitations TO service_role;

ALTER TABLE public.client_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client invitations readable by their people" ON public.client_invitations
  FOR SELECT TO authenticated
  USING (private.client_visible(auth.uid(), client_id));

CREATE POLICY "client invitations managed by contract staff" ON public.client_invitations
  FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid()))
  WITH CHECK (private.can_manage_contracts(auth.uid()));

CREATE TRIGGER client_invitations_updated BEFORE UPDATE ON public.client_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX client_invitations_pending_key
  ON public.client_invitations (client_id, lower(email)) WHERE status = 'pending';

CREATE INDEX client_invitations_client_idx ON public.client_invitations (client_id);

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