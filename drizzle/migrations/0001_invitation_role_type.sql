DO $$ BEGIN
  CREATE TYPE public.invitation_role AS ENUM ('investor', 'fund_manager');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.fund_invitations
  ADD COLUMN IF NOT EXISTS invite_role public.invitation_role NOT NULL DEFAULT 'investor';

UPDATE public.fund_invitations
SET invite_role = CASE WHEN role::text = 'fund_manager' THEN 'fund_manager' ELSE 'investor' END::public.invitation_role
WHERE invite_role IS DISTINCT FROM (CASE WHEN role::text = 'fund_manager' THEN 'fund_manager' ELSE 'investor' END::public.invitation_role);

CREATE OR REPLACE FUNCTION public.fund_invitations_sync_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invite_role IS NULL THEN
    NEW.invite_role := CASE WHEN NEW.role::text = 'fund_manager' THEN 'fund_manager' ELSE 'investor' END::public.invitation_role;
  END IF;
  NEW.role := NEW.invite_role::text::public.app_role;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fund_invitations_sync_role ON public.fund_invitations;
CREATE TRIGGER fund_invitations_sync_role
BEFORE INSERT OR UPDATE ON public.fund_invitations
FOR EACH ROW EXECUTE FUNCTION public.fund_invitations_sync_role();