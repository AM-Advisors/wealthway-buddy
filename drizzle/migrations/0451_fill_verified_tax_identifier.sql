CREATE OR REPLACE FUNCTION public.fill_verified_tax_identifier(_subject text, _id uuid, _ciphertext text, _iv text, _key_version integer, _last4 text, _kind text, _session text, _actor uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE existing_last4 text; existing_type text; existing_profile_type text;
BEGIN
  IF _ciphertext IS NULL OR _iv IS NULL OR _session IS NULL OR _last4 !~ '^[0-9]{4}$' OR _key_version <> 1 THEN RAISE EXCEPTION 'Invalid verified identifier'; END IF;
  IF _subject = 'persons' AND _kind = 'ssn' THEN
    SELECT tax_id_last4 INTO existing_last4 FROM public.persons WHERE id = _id AND merged_into_person_id IS NULL FOR UPDATE;
    IF NOT FOUND THEN RETURN 'missing'; END IF;
    IF existing_last4 IS NOT NULL OR EXISTS(SELECT 1 FROM private.person_tax_ids WHERE person_id = _id) THEN RETURN 'occupied'; END IF;
    INSERT INTO private.person_tax_ids(person_id,ciphertext,iv,key_version,updated_by,updated_at) VALUES (_id,_ciphertext,_iv,_key_version,_actor,now()) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN 'occupied'; END IF;
    UPDATE public.persons SET tax_id_last4 = _last4, updated_at = now() WHERE id = _id;
  ELSIF _subject = 'investment_profiles' AND _kind IN ('ssn','ein') THEN
    SELECT tax_id_last4,tax_id_type,profile_type::text INTO existing_last4,existing_type,existing_profile_type FROM public.investment_profiles WHERE id = _id FOR UPDATE;
    IF NOT FOUND THEN RETURN 'missing'; END IF;
    IF (_kind = 'ssn' AND existing_profile_type <> 'individual') OR (_kind = 'ein' AND existing_profile_type IN ('individual','joint','ira','retirement_plan')) THEN RETURN 'mismatch'; END IF;
    IF existing_last4 IS NOT NULL OR (existing_type IS NOT NULL AND existing_type <> _kind) OR EXISTS(SELECT 1 FROM private.investment_profile_tax_ids WHERE profile_id = _id) THEN RETURN 'occupied'; END IF;
    INSERT INTO private.investment_profile_tax_ids(profile_id,ciphertext,iv,key_version,updated_by,updated_at) VALUES (_id,_ciphertext,_iv,_key_version,_actor,now()) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN 'occupied'; END IF;
    UPDATE public.investment_profiles SET tax_id_last4 = _last4, tax_id_type = _kind, updated_at = now() WHERE id = _id;
    UPDATE public.entity_verifications SET tax_id_last4 = _last4, updated_at = now() WHERE profile_id = _id AND tax_id_last4 IS NULL AND _kind = 'ein';
    INSERT INTO public.investment_profile_events(profile_id,actor_id,event,detail) VALUES (_id,_actor,'tax_id_filled_from_verification',jsonb_build_object('session',_session,'kind',_kind));
  ELSE RAISE EXCEPTION 'Invalid verified identifier target'; END IF;
  INSERT INTO public.investor_record_changes(subject_table,subject_id,field,old_value,new_value,source,actor_user_id,manager_visible) VALUES (_subject,_id,'tax_id',NULL,'"On file from approved verification"'::jsonb,'provider',_actor,false);
  RETURN 'filled';
END;
$$;
REVOKE ALL ON FUNCTION public.fill_verified_tax_identifier(text,uuid,text,text,integer,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fill_verified_tax_identifier(text,uuid,text,text,integer,text,text,text,uuid) TO service_role;