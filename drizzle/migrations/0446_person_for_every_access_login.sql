CREATE OR REPLACE FUNCTION private.ensure_person_for_login(_uid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_email text; v_name text;
BEGIN
  IF _uid IS NULL OR EXISTS (SELECT 1 FROM public.persons WHERE user_id = _uid) THEN RETURN; END IF;
  SELECT u.email, NULLIF(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), '')
    INTO v_email, v_name FROM auth.users u WHERE u.id = _uid;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.persons (user_id, email, legal_first_name, legal_last_name, onboarding_state, entry_source)
  VALUES (_uid, v_email,
          CASE WHEN v_name IS NULL THEN NULL ELSE split_part(v_name, ' ', 1) END,
          CASE WHEN v_name IS NULL OR position(' ' in v_name) = 0 THEN NULL ELSE substr(v_name, position(' ' in v_name) + 1) END,
          'account_created', 'access_grant')
  ON CONFLICT DO NOTHING;
END $f$;
REVOKE ALL ON FUNCTION private.ensure_person_for_login(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.person_for_access_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF TG_TABLE_NAME = 'fund_team_grants' THEN
    PERFORM private.ensure_person_for_login(NEW.grantee_user_id);
  ELSE
    PERFORM private.ensure_person_for_login(NEW.user_id);
  END IF;
  RETURN NEW;
END $f$;

CREATE TRIGGER person_for_fund_manager AFTER INSERT OR UPDATE OF user_id ON public.fund_managers
  FOR EACH ROW EXECUTE FUNCTION private.person_for_access_row();
CREATE TRIGGER person_for_client_member AFTER INSERT OR UPDATE OF user_id ON public.client_users
  FOR EACH ROW EXECUTE FUNCTION private.person_for_access_row();
CREATE TRIGGER person_for_fund_team_grant AFTER INSERT OR UPDATE OF grantee_user_id ON public.fund_team_grants
  FOR EACH ROW EXECUTE FUNCTION private.person_for_access_row();

SELECT private.ensure_person_for_login(x.uid) FROM (
  SELECT user_id uid FROM public.fund_managers
  UNION SELECT user_id FROM public.client_users WHERE revoked_at IS NULL
  UNION SELECT grantee_user_id FROM public.fund_team_grants WHERE status = 'active'
) x WHERE x.uid IS NOT NULL;