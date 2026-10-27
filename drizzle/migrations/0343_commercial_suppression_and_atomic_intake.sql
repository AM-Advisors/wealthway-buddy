CREATE FUNCTION public.promotional_suppressed_emails(_emails text[]) RETURNS TABLE(email text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT DISTINCT lower(btrim(e.email)) FROM public.email_unsubscribes e WHERE e.unsubscribed_at IS NOT NULL AND lower(btrim(e.email)) = ANY(_emails)
 UNION SELECT DISTINCT lower(btrim(c.email)) FROM public.crm_contacts c WHERE c.consent='unsubscribed' AND lower(btrim(c.email))=ANY(_emails)
 UNION SELECT DISTINCT lower(btrim(c.email)) FROM public.crm_contacts c JOIN public.sales_channel_optouts o ON o.contact_id=c.id AND o.channel='email' WHERE lower(btrim(c.email))=ANY(_emails)
$$;
REVOKE ALL ON FUNCTION public.promotional_suppressed_emails(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promotional_suppressed_emails(text[]) TO service_role;
CREATE FUNCTION public.qualify_commercial_inquiry(_actor uuid,_lead uuid,_owner uuid,_contact uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.marketing_leads%ROWTYPE; c public.crm_contacts%ROWTYPE; d uuid; existing public.commercial_intake_links%ROWTYPE; all_scope boolean; owner_ok boolean; company uuid;
BEGIN
 all_scope := EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_actor AND role::text IN ('super_admin','executive','cro','admin'));
 IF NOT all_scope AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_actor AND role::text='sales_management') THEN RAISE EXCEPTION 'Sales leadership is required'; END IF;
 SELECT * INTO l FROM public.marketing_leads WHERE id=_lead FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Inquiry not found'; END IF;
 SELECT * INTO existing FROM public.commercial_intake_links WHERE lead_id=_lead;
 IF FOUND THEN RETURN jsonb_build_object('contact_id',existing.contact_id,'deal_id',existing.deal_id); END IF;
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_owner AND role::text IN ('sales','account_executive','bdr','sales_management','cro','account_manager')) INTO owner_ok;
 IF NOT owner_ok THEN RAISE EXCEPTION 'Eligible Sales owner is required'; END IF;
 IF NOT all_scope AND NOT EXISTS(WITH RECURSIVE downline AS (SELECT _actor AS user_id UNION SELECT r.user_id FROM public.sales_reporting_lines r JOIN downline x ON r.manager_user_id=x.user_id) SELECT 1 FROM downline WHERE user_id=_owner) THEN RAISE EXCEPTION 'Owner is outside your Sales team'; END IF;
 IF _contact IS NOT NULL THEN
  SELECT * INTO c FROM public.crm_contacts WHERE id=_contact AND scope='harmonious' AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND OR lower(btrim(c.email)) IS DISTINCT FROM lower(btrim(l.work_email)) THEN RAISE EXCEPTION 'Matching contact is required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_actor AND role::text='super_admin') AND c.owner_user_id<>_actor AND NOT EXISTS(SELECT 1 FROM public.access_permission_grants WHERE user_id=_actor AND permission='administration.crm.view_all' AND effect='allow' AND revoked_at IS NULL AND effective_at<=now() AND (expires_at IS NULL OR expires_at>now())) THEN RAISE EXCEPTION 'Contact is not entitled'; END IF;
 ELSE
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(btrim(l.work_email)),0));
  IF EXISTS(SELECT 1 FROM public.crm_contacts WHERE scope='harmonious' AND lower(btrim(email))=lower(btrim(l.work_email)) AND archived_at IS NULL) THEN RAISE EXCEPTION 'Review a matching contact before creating another'; END IF;
  SELECT id INTO company FROM public.crm_companies WHERE scope='harmonious' AND owner_user_id=_owner AND offering_id IS NULL AND lower(btrim(name))=lower(btrim(l.company)) LIMIT 1;
  IF company IS NULL THEN INSERT INTO public.crm_companies(scope,owner_user_id,name) VALUES('harmonious',_owner,l.company) RETURNING id INTO company; END IF;
  INSERT INTO public.crm_contacts(scope,owner_user_id,created_by,full_name,email,organization,company_id,source,consent) VALUES('harmonious',_owner,_actor,l.name,lower(btrim(l.work_email)),l.company,company,'Website inquiry','unknown') RETURNING * INTO c;
 END IF;
 INSERT INTO public.crm_deals(scope,owner_user_id,created_by,contact_id,title,stage,sales_stage,stage_changed_at) VALUES('harmonious',_owner,_actor,c.id,left(l.company||': '||replace(l.intent,'_',' '),200),'lead','outreach',now()) RETURNING id INTO d;
 INSERT INTO public.commercial_intake_links(lead_id,contact_id,deal_id,actor_id) VALUES(l.id,c.id,d,_actor);
 INSERT INTO public.crm_activity(scope,contact_id,deal_id,actor_user_id,kind,summary,details) VALUES('harmonious',c.id,d,_actor,'inquiry_qualified','Website inquiry qualified and assigned',jsonb_build_object('lead_id',l.id,'owner_id',_owner));
 RETURN jsonb_build_object('contact_id',c.id,'deal_id',d);
END $$;
REVOKE ALL ON FUNCTION public.qualify_commercial_inquiry(uuid,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qualify_commercial_inquiry(uuid,uuid,uuid,uuid) TO service_role;