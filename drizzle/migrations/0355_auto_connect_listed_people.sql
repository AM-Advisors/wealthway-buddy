CREATE TABLE public.account_auto_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('client_contact','fund_team_member')),
  source_id uuid NOT NULL,
  scope_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, source_id)
);
GRANT SELECT ON public.account_auto_links TO authenticated;
GRANT ALL ON public.account_auto_links TO service_role;
ALTER TABLE public.account_auto_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own auto links" ON public.account_auto_links FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.connect_listed_entries(_uid uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _email text; _n integer := 0; r record;
BEGIN
  SELECT lower(email) INTO _email FROM auth.users WHERE id = _uid AND email_confirmed_at IS NOT NULL;
  IF _email IS NULL OR _email = '' THEN RETURN 0; END IF;
  FOR r IN SELECT id, client_id FROM public.client_contacts
           WHERE lower(email) = _email AND status = 'active' AND invite_cancelled_at IS NULL
             AND (user_id IS NULL OR user_id = _uid) LOOP
    UPDATE public.client_contacts SET user_id = _uid WHERE id = r.id AND user_id IS NULL;
    IF NOT EXISTS (SELECT 1 FROM public.client_users WHERE client_id = r.client_id AND user_id = _uid) THEN
      INSERT INTO public.client_users (client_id, user_id, client_role, can_approve) VALUES (r.client_id, _uid, 'client_readonly', false);
      INSERT INTO public.account_auto_links (user_id,email,kind,source_id,scope_id) VALUES (_uid,_email,'client_contact',r.id,r.client_id) ON CONFLICT DO NOTHING;
      _n := _n + 1;
    END IF;
  END LOOP;
  FOR r IN SELECT id, offering_id FROM public.fund_team_members
           WHERE lower(email) = _email AND user_id IS NULL AND removed_at IS NULL LOOP
    UPDATE public.fund_team_members SET user_id = _uid WHERE id = r.id;
    INSERT INTO public.account_auto_links (user_id,email,kind,source_id,scope_id) VALUES (_uid,_email,'fund_team_member',r.id,r.offering_id) ON CONFLICT DO NOTHING;
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.connect_listed_entries(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.connect_my_listed_entries()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN 0 ELSE public.connect_listed_entries(auth.uid()) END
$$;
REVOKE ALL ON FUNCTION public.connect_my_listed_entries() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.connect_my_listed_entries() TO authenticated;

CREATE OR REPLACE FUNCTION public.connect_listed_entry_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  IF NEW.email IS NULL OR NEW.user_id IS NOT NULL THEN RETURN NULL; END IF;
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = lower(NEW.email) AND email_confirmed_at IS NOT NULL LIMIT 1;
  IF _uid IS NOT NULL THEN PERFORM public.connect_listed_entries(_uid); END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER client_contacts_auto_connect AFTER INSERT OR UPDATE OF email, status ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.connect_listed_entry_trigger();
CREATE TRIGGER fund_team_members_auto_connect AFTER INSERT OR UPDATE OF email, removed_at ON public.fund_team_members
  FOR EACH ROW EXECUTE FUNCTION public.connect_listed_entry_trigger();

SELECT public.connect_listed_entries(u.id) FROM auth.users u WHERE u.email_confirmed_at IS NOT NULL
  AND (EXISTS (SELECT 1 FROM public.client_contacts c WHERE lower(c.email)=lower(u.email))
    OR EXISTS (SELECT 1 FROM public.fund_team_members t WHERE lower(t.email)=lower(u.email)));