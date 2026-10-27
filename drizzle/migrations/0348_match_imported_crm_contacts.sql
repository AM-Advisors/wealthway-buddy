CREATE OR REPLACE FUNCTION public.match_imported_crm_contact(_actor uuid,_source text,_external_id text,_fields jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.crm_contacts; email_key text; matches integer;
BEGIN
 IF _source NOT IN ('clickup','hubspot') OR NULLIF(btrim(_external_id),'') IS NULL THEN RAISE EXCEPTION 'Invalid contact source'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_actor AND role::text IN ('super_admin','executive','cro','admin','marketing_manager','marketing_specialist')) THEN RAISE EXCEPTION 'Import authority required'; END IF;
 email_key:=NULLIF(lower(btrim(_fields->>'email')),'');
 PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(email_key,_source||':'||_external_id),0));
 SELECT x.* INTO c FROM public.crm_contact_source_links l JOIN public.crm_contacts x ON x.id=l.contact_id WHERE l.external_source=_source AND l.external_id=_external_id;
 IF NOT FOUND THEN SELECT * INTO c FROM public.crm_contacts WHERE external_source=_source AND external_id=_external_id; END IF;
 IF c.id IS NULL AND email_key IS NOT NULL THEN
  SELECT count(*) INTO matches FROM public.crm_contacts WHERE scope='harmonious' AND archived_at IS NULL AND lower(btrim(email))=email_key;
  IF matches>0 THEN
   SELECT * INTO c FROM public.crm_contacts WHERE scope='harmonious' AND archived_at IS NULL AND owner_user_id=_actor AND lower(btrim(email))=email_key ORDER BY created_at,id LIMIT 1;
   IF c.id IS NULL THEN
    INSERT INTO public.crm_import_match_reviews(external_source,external_id,email) VALUES(_source,_external_id,email_key) ON CONFLICT(external_source,external_id) DO NOTHING;
    RETURN jsonb_build_object('kind','review','contactId',NULL);
   END IF;
  END IF;
 END IF;
 IF c.id IS NULL THEN
  INSERT INTO public.crm_contacts(full_name,email,phone,organization,title,tags,scope,owner_user_id,created_by,source,consent,external_source,external_id)
  VALUES(COALESCE(NULLIF(btrim(_fields->>'full_name'),''),'Imported contact'),email_key,NULLIF(_fields->>'phone',''),NULLIF(_fields->>'organization',''),NULLIF(_fields->>'title',''),ARRAY(SELECT jsonb_array_elements_text(COALESCE(_fields->'tags','[]'::jsonb))),'harmonious',_actor,_actor,_source,'unknown',_source,_external_id) RETURNING * INTO c;
 END IF;
 INSERT INTO public.crm_contact_source_links(contact_id,external_source,external_id,actor_id) VALUES(c.id,_source,_external_id,_actor) ON CONFLICT(external_source,external_id) DO NOTHING;
 RETURN jsonb_build_object('kind','linked','contactId',c.id);
END $$;
REVOKE ALL ON FUNCTION public.match_imported_crm_contact(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.match_imported_crm_contact(uuid,text,text,jsonb) TO service_role;