ALTER TABLE public.client_contacts ADD COLUMN IF NOT EXISTS added_for_offering_id uuid NULL;
COMMENT ON COLUMN public.client_contacts.added_for_offering_id IS 'Set when a fund screen (signer or fund invite) created this contact. Its login links to the contact but is never given company-wide view; company access stays an explicit People & Access change.';

CREATE OR REPLACE FUNCTION public.connect_listed_entries(_uid uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _email text; _n integer := 0; r record;
BEGIN
  SELECT lower(email) INTO _email FROM auth.users WHERE id = _uid AND email_confirmed_at IS NOT NULL;
  IF _email IS NULL OR _email = '' THEN RETURN 0; END IF;
  FOR r IN SELECT id, client_id, added_for_offering_id FROM public.client_contacts
           WHERE lower(email) = _email AND status = 'active' AND invite_cancelled_at IS NULL
             AND (user_id IS NULL OR user_id = _uid) LOOP
    UPDATE public.client_contacts SET user_id = _uid WHERE id = r.id AND user_id IS NULL;
    -- Contacts created from one fund's screen never open the whole company.
    IF r.added_for_offering_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.client_users WHERE client_id = r.client_id AND user_id = _uid) THEN
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
END $function$;