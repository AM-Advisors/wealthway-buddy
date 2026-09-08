CREATE TABLE public.fund_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL,
  token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_name text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX fund_invitations_unique_pending
  ON public.fund_invitations (offering_id, lower(email), role)
  WHERE status = 'pending';
CREATE INDEX fund_invitations_email_idx ON public.fund_invitations (lower(email));
CREATE INDEX fund_invitations_offering_idx ON public.fund_invitations (offering_id);
CREATE UNIQUE INDEX fund_invitations_token_idx ON public.fund_invitations (token);

GRANT SELECT, INSERT, UPDATE ON public.fund_invitations TO authenticated;
GRANT ALL ON public.fund_invitations TO service_role;

ALTER TABLE public.fund_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage invitations" ON public.fund_invitations
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "managers manage invitations for their funds" ON public.fund_invitations
  FOR ALL TO authenticated
  USING (private.manages_offering(offering_id))
  WITH CHECK (private.manages_offering(offering_id));

CREATE POLICY "invitees read their own invitation" ON public.fund_invitations
  FOR SELECT TO authenticated
  USING (lower(email) = lower(COALESCE((auth.jwt() ->> 'email'), '')));

CREATE TRIGGER fund_invitations_updated
  BEFORE UPDATE ON public.fund_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
    SELECT * FROM public.fund_invitations
    WHERE lower(email) = v_email AND status = 'pending' AND expires_at > now()
  LOOP
    IF inv.role = 'fund_manager'::public.app_role THEN
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

CREATE TRIGGER on_auth_user_created_sync_access
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_roles_and_invitations();

CREATE TRIGGER on_auth_user_confirmed_sync_access
  AFTER UPDATE OF email_confirmed_at, email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_roles_and_invitations();

DELETE FROM public.user_roles ur
USING auth.users u
WHERE ur.user_id = u.id
  AND ur.role = 'admin'::public.app_role
  AND split_part(lower(COALESCE(u.email, '')), '@', 2) <> 'harmonious.co';

INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT x.user_id, 'investor'::public.app_role
FROM (
  SELECT user_id FROM public.investor_applications
  UNION
  SELECT user_id FROM public.investor_fund_access
) x
ON CONFLICT (user_id, role) DO NOTHING;