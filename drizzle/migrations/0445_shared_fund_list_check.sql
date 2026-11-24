CREATE OR REPLACE FUNCTION private.fund_list_allows(_uid uuid, _fund uuid, _level text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT _uid IS NOT NULL AND _fund IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = _fund AND fm.user_id = _uid)
    OR (_level IN ('manage','view') AND EXISTS (
      SELECT 1 FROM public.offerings o WHERE o.id = _fund AND o.client_id IS NOT NULL AND (
        EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = o.client_id AND cu.user_id = _uid AND cu.revoked_at IS NULL)
        OR EXISTS (SELECT 1 FROM public.fund_managers fm2 JOIN public.offerings o2 ON o2.id = fm2.offering_id WHERE fm2.user_id = _uid AND o2.client_id = o.client_id))))
    OR (_level = 'view' AND EXISTS (
      SELECT 1 FROM public.fund_team_grants g WHERE g.offering_id = _fund AND g.grantee_user_id = _uid
        AND g.status = 'active' AND (g.expires_at IS NULL OR g.expires_at > now())))
  )
$f$;
COMMENT ON FUNCTION private.fund_list_allows(uuid, uuid, text) IS 'Shared fund access from the fund''s own lists (no staff shortcut), matching fund-access.ts levels manager/manage/view. Each rule keeps its own staff check.';
CREATE OR REPLACE FUNCTION private.fund_list_allows_path(_uid uuid, _fund_text text, _level text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  SELECT EXISTS (SELECT 1 FROM public.offerings o WHERE o.id::text = _fund_text AND private.fund_list_allows(_uid, o.id, _level))
$f$;
REVOKE ALL ON FUNCTION private.fund_list_allows(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.fund_list_allows_path(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.fund_list_allows(uuid, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.fund_list_allows_path(uuid, text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.manages_offering(_offering_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT private.has_role(auth.uid(), 'admin'::public.app_role)
      OR private.fund_list_allows(auth.uid(), _offering_id, 'manager')
$function$
;
CREATE OR REPLACE FUNCTION public.can_manage_diligence(_offering_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.fund_list_allows(auth.uid(), _offering_id, 'manager')
  )
$function$
;
CREATE OR REPLACE FUNCTION public.can_read_wire_instructions(_offering_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.fund_list_allows(auth.uid(), _offering_id, 'manager')
    OR EXISTS (SELECT 1 FROM public.investor_applications a WHERE a.offering_id = _offering_id AND a.user_id = auth.uid())
  )
$function$
;
CREATE OR REPLACE FUNCTION public.fund_condition_context(p_offering_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_id uuid;
  v_client_name text;
  v_configured boolean := false;
  v_overrides jsonb := '{}'::jsonb;
  v_allowed boolean := false;
  v_clearances jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_unaccredited integer := 0;
  v_reg_type text;
  v_name text;
  r record;
BEGIN
  SELECT o.client_id, o.reg_type::text, o.name
    INTO v_client_id, v_reg_type, v_name
    FROM public.offerings o WHERE o.id = p_offering_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_allowed := private.is_staff(auth.uid())
    OR private.can_manage_contracts(auth.uid())
    OR private.fund_list_allows(auth.uid(), p_offering_id, 'manager')
    OR EXISTS (SELECT 1 FROM public.investor_fund_access a WHERE a.offering_id = p_offering_id AND a.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.investor_applications ia WHERE ia.offering_id = p_offering_id AND ia.user_id = auth.uid())
    OR (v_client_id IS NOT NULL AND private.client_visible(auth.uid(), v_client_id));

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not authorised for this fund';
  END IF;

  IF v_client_id IS NOT NULL THEN
    SELECT c.name INTO v_client_name FROM public.clients c WHERE c.id = v_client_id;
    FOR r IN
      SELECT s.eligibility FROM public.client_sows s
      WHERE s.client_id = v_client_id AND s.status = 'active'
    LOOP
      v_configured := true;
      v_overrides := v_overrides || coalesce(r.eligibility, '{}'::jsonb);
    END LOOP;
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE ia.accreditation_status::text IN ('declined','not_started'))
    INTO v_total, v_unaccredited
    FROM public.investor_applications ia
   WHERE ia.offering_id = p_offering_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'rule_key', fc.rule_key,
           'kind', fc.kind,
           'reason', fc.reason,
           'snapshot', fc.snapshot,
           'created_at', fc.created_at
         ) ORDER BY fc.created_at DESC), '[]'::jsonb)
    INTO v_clearances
    FROM public.fund_condition_clearances fc
   WHERE fc.offering_id = p_offering_id;

  RETURN jsonb_build_object(
    'offering_id', p_offering_id,
    'name', v_name,
    'reg_type', v_reg_type,
    'client_id', v_client_id,
    'client_name', v_client_name,
    'configured', v_configured,
    'overrides', v_overrides,
    'clearances', v_clearances,
    'investor_count', v_total,
    'unaccredited_count', v_unaccredited
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_wire_instructions(p_offering_id uuid)
 RETURNS TABLE(offering_id uuid, details jsonb, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_read_wire_instructions(p_offering_id) THEN
    RAISE EXCEPTION 'Not authorized to read wire instructions';
  END IF;
  IF private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN QUERY SELECT w.offering_id, w.details, w.updated_at FROM private.offering_wire_instructions w WHERE w.offering_id = p_offering_id;
    RETURN;
  END IF;
  IF private.fund_list_allows(auth.uid(), p_offering_id, 'manager') THEN
    RETURN QUERY SELECT p_offering_id, m.details, m.updated_at FROM private.masked_current_bank_details(p_offering_id) m;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.investor_applications a
     WHERE a.offering_id = p_offering_id AND a.user_id = auth.uid()
       AND (a.documents_status::text = 'approved' OR a.status::text IN ('funded','closed'))
  ) THEN
    RETURN;
  END IF;
  -- Investors: only the exact verified version Harmonious released.
  IF NOT COALESCE((public.offering_wire_release_state(p_offering_id)->>'available')::boolean, false) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT v.offering_id, v.details, v.verified_at
    FROM private.offering_bank_instruction_versions v
    WHERE v.offering_id = p_offering_id
      AND v.version = (SELECT MAX(x.version) FROM private.offering_bank_instruction_versions x WHERE x.offering_id = p_offering_id)
      AND v.status = 'verified' AND v.ownership_review <> 'review_required';
END;
$function$
;
CREATE OR REPLACE FUNCTION private.fdr_can_read(_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_fund uuid := private.fdr_fund_id(_name);
  v_lp uuid := private.fdr_lp_id(_name);
  v_is_lp boolean := private.fdr_is_lp_object(_name);
BEGIN
  IF v_uid IS NULL OR v_fund IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.offerings o WHERE o.id = v_fund) THEN RETURN false; END IF;
  IF private.is_staff(v_uid) THEN RETURN true; END IF;
  IF v_is_lp THEN
    IF v_lp IS NULL OR v_lp <> v_uid THEN RETURN false; END IF;
    RETURN EXISTS (SELECT 1 FROM public.investor_applications ia WHERE ia.offering_id = v_fund AND ia.user_id = v_uid);
  END IF;
  IF private.fund_list_allows(v_uid, v_fund, 'manager') THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.investor_fund_access ifa WHERE ifa.offering_id = v_fund AND ifa.user_id = v_uid);
END;
$function$
;
CREATE OR REPLACE FUNCTION private.fdr_can_write(_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_fund uuid := private.fdr_fund_id(_name);
  v_lp uuid := private.fdr_lp_id(_name);
  v_is_lp boolean := private.fdr_is_lp_object(_name);
BEGIN
  IF v_uid IS NULL OR v_fund IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.offerings o WHERE o.id = v_fund) THEN RETURN false; END IF;
  IF private.is_staff(v_uid) THEN RETURN true; END IF;
  IF v_is_lp THEN
    IF v_lp IS NULL OR v_lp <> v_uid THEN RETURN false; END IF;
    RETURN EXISTS (SELECT 1 FROM public.investor_applications ia WHERE ia.offering_id = v_fund AND ia.user_id = v_uid);
  END IF;
  RETURN private.fund_list_allows(v_uid, v_fund, 'manager');
END;
$function$
;
CREATE OR REPLACE FUNCTION public.can_view_side_letters(_offering_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_any_staff()
    OR private.fund_list_allows(auth.uid(), _offering_id, 'manager')
    OR EXISTS (SELECT 1 FROM public.fund_team_grants g WHERE g.offering_id = _offering_id AND g.grantee_user_id = auth.uid()
               AND g.status = 'active' AND (g.expires_at IS NULL OR g.expires_at > now()))
  )
$function$
;
CREATE OR REPLACE FUNCTION public.save_wire_instructions(p_offering_id uuid, p_details jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prev jsonb;
  v_next integer;
  v_legal text;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.fund_list_allows(auth.uid(), p_offering_id, 'manager')
  ) THEN
    RAISE EXCEPTION 'Only administrators or assigned fund managers can change wire instructions';
  END IF;
  SELECT details INTO v_prev FROM private.offering_bank_instruction_versions
    WHERE offering_id = p_offering_id ORDER BY version DESC LIMIT 1;
  INSERT INTO private.offering_wire_instructions (offering_id, details, updated_at)
  VALUES (p_offering_id, COALESCE(p_details, '{}'::jsonb), now())
  ON CONFLICT (offering_id) DO UPDATE SET details = EXCLUDED.details, updated_at = now();
  IF COALESCE(p_details, '{}'::jsonb) <> '{}'::jsonb AND (v_prev IS NULL OR v_prev <> p_details) THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next FROM private.offering_bank_instruction_versions WHERE offering_id = p_offering_id;
    SELECT legal_entity_name INTO v_legal FROM public.offerings WHERE id = p_offering_id;
    INSERT INTO private.offering_bank_instruction_versions (offering_id, version, details, ownership_review, created_by)
    VALUES (
      p_offering_id, v_next, p_details,
      CASE WHEN v_legal IS NOT NULL AND private.norm_name(p_details->>'account_name') <> private.norm_name(v_legal)
           THEN 'review_required' ELSE 'not_needed' END,
      auth.uid()
    );
  END IF;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.can_prepare_investor(_offering_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_any_staff() OR private.fund_list_allows(auth.uid(), _offering_id, 'manager')
$function$
;
ALTER POLICY "managers read profiles" ON public.profiles
  USING (EXISTS ( SELECT 1
   FROM investor_applications a
  WHERE ((a.user_id = profiles.user_id) AND private.fund_list_allows(auth.uid(), a.offering_id, 'manager'))));
ALTER POLICY "Fund managers read funding acknowledgements" ON public.funding_acknowledgements
  USING (EXISTS ( SELECT 1
   FROM investor_applications a
  WHERE ((a.id = funding_acknowledgements.application_id) AND private.fund_list_allows(auth.uid(), a.offering_id, 'manager'))));
ALTER POLICY "managers read accreditation files" ON storage.objects
  USING ((bucket_id = 'accreditation-docs'::text) AND (EXISTS ( SELECT 1
   FROM investor_applications a
  WHERE (private.fund_list_allows(auth.uid(), a.offering_id, 'manager') AND ((a.user_id)::text = (storage.foldername(objects.name))[1])))));
ALTER POLICY "managers read signed documents" ON storage.objects
  USING ((bucket_id = 'signed-documents'::text) AND (EXISTS ( SELECT 1
   FROM investor_applications a
  WHERE (private.fund_list_allows(auth.uid(), a.offering_id, 'manager') AND ((a.user_id)::text = (storage.foldername(objects.name))[1])))));
ALTER POLICY "docs readable by permitted users" ON public.offering_documents
  USING (EXISTS ( SELECT 1
   FROM offerings o
  WHERE ((o.id = offering_documents.offering_id) AND ((o.reg_type = '506c'::reg_type) OR private.has_role(auth.uid(), 'admin'::app_role) OR private.fund_list_allows(auth.uid(), o.id, 'manager') OR (EXISTS ( SELECT 1
           FROM investor_fund_access ia
          WHERE ((ia.offering_id = o.id) AND (ia.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM investor_applications a
          WHERE ((a.offering_id = o.id) AND (a.user_id = auth.uid()))))))));
ALTER POLICY "funds readable by permitted users" ON public.offerings
  USING ((reg_type = '506c'::reg_type) OR private.has_role(auth.uid(), 'admin'::app_role) OR private.fund_list_allows(auth.uid(), offerings.id, 'manager') OR (EXISTS ( SELECT 1
   FROM investor_fund_access ia
  WHERE ((ia.offering_id = offerings.id) AND (ia.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM investor_applications a
  WHERE ((a.offering_id = offerings.id) AND (a.user_id = auth.uid())))));
ALTER POLICY "Fund managers read wire confirmations" ON public.wire_confirmations
  USING (EXISTS ( SELECT 1
   FROM investor_applications a
  WHERE ((a.id = wire_confirmations.application_id) AND private.fund_list_allows(auth.uid(), a.offering_id, 'manager'))));
ALTER POLICY "Fund managers decide wire confirmations" ON public.wire_confirmations
  USING (EXISTS ( SELECT 1
   FROM investor_applications a
  WHERE ((a.id = wire_confirmations.application_id) AND private.fund_list_allows(auth.uid(), a.offering_id, 'manager'))))
  WITH CHECK (EXISTS ( SELECT 1
   FROM investor_applications a
  WHERE ((a.id = wire_confirmations.application_id) AND private.fund_list_allows(auth.uid(), a.offering_id, 'manager'))));
ALTER POLICY "Reviewers read flags for their funds" ON public.application_flags
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.fund_list_allows(auth.uid(), application_flags.offering_id, 'manager'));
ALTER POLICY "Reviewers raise flags for their funds" ON public.application_flags
  WITH CHECK ((created_by = auth.uid()) AND (private.has_role(auth.uid(), 'admin'::app_role) OR private.fund_list_allows(auth.uid(), application_flags.offering_id, 'manager')));
ALTER POLICY "Reviewers update flags for their funds" ON public.application_flags
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.fund_list_allows(auth.uid(), application_flags.offering_id, 'manager'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.fund_list_allows(auth.uid(), application_flags.offering_id, 'manager'));
ALTER POLICY "Assigned managers read uploads for their funds" ON public.investor_documents
  USING (private.fund_list_allows(auth.uid(), investor_documents.offering_id, 'manager'));
ALTER POLICY "Managers read investor uploads for their funds" ON storage.objects
  USING ((bucket_id = 'investor-uploads'::text) AND (EXISTS ( SELECT 1
   FROM investor_documents d
  WHERE ((d.storage_path = objects.name) AND private.fund_list_allows(auth.uid(), d.offering_id, 'manager')))));
ALTER POLICY "Reviewers read packet links" ON public.offering_packet_links
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.fund_list_allows(auth.uid(), offering_packet_links.offering_id, 'manager'));
ALTER POLICY "Reviewers create packet links" ON public.offering_packet_links
  WITH CHECK ((created_by = auth.uid()) AND (private.has_role(auth.uid(), 'admin'::app_role) OR private.fund_list_allows(auth.uid(), offering_packet_links.offering_id, 'manager')));
ALTER POLICY "Reviewers update packet links" ON public.offering_packet_links
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.fund_list_allows(auth.uid(), offering_packet_links.offering_id, 'manager'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.fund_list_allows(auth.uid(), offering_packet_links.offering_id, 'manager'));
ALTER POLICY "managers write docs for their funds" ON public.offering_documents
  USING (private.fund_list_allows(auth.uid(), offering_documents.offering_id, 'manager'))
  WITH CHECK (private.fund_list_allows(auth.uid(), offering_documents.offering_id, 'manager'));
ALTER POLICY "Reviewers upload fund document files" ON storage.objects
  WITH CHECK ((bucket_id = 'offering-files'::text) AND (private.has_role(auth.uid(), 'admin'::app_role) OR private.fund_list_allows_path(auth.uid(), (storage.foldername(objects.name))[1], 'manager')));
ALTER POLICY "Fund people read fund document files" ON storage.objects
  USING ((bucket_id = 'offering-files'::text) AND (private.has_role(auth.uid(), 'admin'::app_role) OR private.fund_list_allows_path(auth.uid(), (storage.foldername(objects.name))[1], 'manager') OR (EXISTS ( SELECT 1
   FROM investor_applications a
  WHERE ((a.user_id = auth.uid()) AND ((a.offering_id)::text = (storage.foldername(objects.name))[1])))) OR (EXISTS ( SELECT 1
   FROM investor_fund_access f
  WHERE ((f.user_id = auth.uid()) AND ((f.offering_id)::text = (storage.foldername(objects.name))[1]))))));
ALTER POLICY "Reviewers remove fund document files" ON storage.objects
  USING ((bucket_id = 'offering-files'::text) AND (private.has_role(auth.uid(), 'admin'::app_role) OR private.fund_list_allows_path(auth.uid(), (storage.foldername(objects.name))[1], 'manager')));
ALTER POLICY "Reviewers read scoped activity" ON public.reviewer_activity
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR (actor_id = auth.uid()) OR private.fund_list_allows(auth.uid(), reviewer_activity.offering_id, 'manager'));
ALTER POLICY "Reviewers update upload review state" ON public.investor_documents
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.fund_list_allows(auth.uid(), investor_documents.offering_id, 'manager'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.fund_list_allows(auth.uid(), investor_documents.offering_id, 'manager'));
ALTER POLICY "Managers and admins can read wire requests" ON public.wire_requests
  USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'admin'::app_role)))) OR private.fund_list_allows(auth.uid(), wire_requests.offering_id, 'manager'));
ALTER POLICY "Managers can create wire requests for their funds" ON public.wire_requests
  WITH CHECK ((requested_by = auth.uid()) AND ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'admin'::app_role)))) OR private.fund_list_allows(auth.uid(), wire_requests.offering_id, 'manager')));
ALTER POLICY "Reviewers read step opens for their funds" ON public.onboarding_step_views
  USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'admin'::app_role)))) OR private.fund_list_allows(auth.uid(), onboarding_step_views.offering_id, 'manager'));
ALTER POLICY "document versions readable by fund team" ON public.offering_document_versions
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.fund_list_allows(auth.uid(), offering_document_versions.offering_id, 'manager'));
ALTER POLICY "Reviewers read investor accounts" ON public.investor_personas
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR (EXISTS ( SELECT 1
   FROM investor_applications a
  WHERE ((a.persona_id = investor_personas.id) AND private.fund_list_allows(auth.uid(), a.offering_id, 'manager')))));
ALTER POLICY "holds readable by affected people" ON public.compliance_holds
  USING (private.is_staff(auth.uid()) OR (subject_user_id = auth.uid()) OR ((client_id IS NOT NULL) AND private.client_visible(auth.uid(), client_id)) OR ((offering_id IS NOT NULL) AND private.fund_list_allows(auth.uid(), compliance_holds.offering_id, 'manager')));
ALTER POLICY "payment instructions readable" ON public.payment_instructions
  USING (private.is_staff(auth.uid()) OR (requested_by = auth.uid()) OR ((offering_id IS NOT NULL) AND private.fund_list_allows(auth.uid(), payment_instructions.offering_id, 'manager')));
ALTER POLICY "responsibility items readable by their people" ON public.responsibility_items
  USING (private.is_staff(auth.uid()) OR ((client_id IS NOT NULL) AND private.client_visible(auth.uid(), client_id)) OR ((offering_id IS NOT NULL) AND private.fund_list_allows(auth.uid(), responsibility_items.offering_id, 'manager')));
ALTER POLICY "responsibility items updated by their people" ON public.responsibility_items
  USING (private.is_staff(auth.uid()) OR ((client_id IS NOT NULL) AND private.client_visible(auth.uid(), client_id)) OR ((offering_id IS NOT NULL) AND private.fund_list_allows(auth.uid(), responsibility_items.offering_id, 'manager')))
  WITH CHECK (private.is_staff(auth.uid()) OR ((client_id IS NOT NULL) AND private.client_visible(auth.uid(), client_id)) OR ((offering_id IS NOT NULL) AND private.fund_list_allows(auth.uid(), responsibility_items.offering_id, 'manager')));
ALTER POLICY "Staff and fund people can read clearances" ON public.fund_condition_clearances
  USING (private.is_staff(auth.uid()) OR private.can_manage_contracts(auth.uid()) OR private.fund_list_allows(auth.uid(), fund_condition_clearances.offering_id, 'manager') OR (EXISTS ( SELECT 1
   FROM offerings o
  WHERE ((o.id = fund_condition_clearances.offering_id) AND (o.client_id IS NOT NULL) AND private.client_visible(auth.uid(), o.client_id)))));
ALTER POLICY "managers manage signature blocks for their funds" ON public.offering_document_signature_blocks
  USING (EXISTS ( SELECT 1
   FROM offering_documents d
  WHERE ((d.id = offering_document_signature_blocks.offering_document_id) AND private.fund_list_allows(auth.uid(), d.offering_id, 'manager'))))
  WITH CHECK (EXISTS ( SELECT 1
   FROM offering_documents d
  WHERE ((d.id = offering_document_signature_blocks.offering_document_id) AND private.fund_list_allows(auth.uid(), d.offering_id, 'manager'))));
ALTER POLICY "Managers read submissions for their funds" ON public.compliance_submissions
  USING (private.fund_list_allows(auth.uid(), compliance_submissions.offering_id, 'manager'));
ALTER POLICY "Participants add submissions" ON public.compliance_submissions
  WITH CHECK ((actor_id = auth.uid()) AND ((user_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role) OR private.fund_list_allows(auth.uid(), compliance_submissions.offering_id, 'manager')));
ALTER POLICY "managers read published fund financials" ON public.financial_reports
  USING ((status = ANY (ARRAY['published'::report_status, 'superseded'::report_status])) AND manager_visible AND (offering_id IS NOT NULL) AND private.fund_list_allows(auth.uid(), financial_reports.offering_id, 'manager'));
ALTER POLICY "manager reads fund onboardings" ON public.investor_onboardings
  USING (private.fund_list_allows(auth.uid(), investor_onboardings.offering_id, 'manager'));
ALTER POLICY "manager reads fund capital calls" ON public.capital_calls
  USING (private.fund_list_allows(auth.uid(), capital_calls.offering_id, 'manager'));
ALTER POLICY "manager reads fund call lines" ON public.capital_call_lines
  USING (private.fund_list_allows(auth.uid(), capital_call_lines.offering_id, 'manager'));
ALTER POLICY "signature blocks readable by permitted users" ON public.offering_document_signature_blocks
  USING (EXISTS ( SELECT 1
   FROM (offering_documents d
     JOIN offerings o ON ((o.id = d.offering_id)))
  WHERE ((d.id = offering_document_signature_blocks.offering_document_id) AND ((o.reg_type = '506c'::reg_type) OR private.has_role(auth.uid(), 'admin'::app_role) OR private.fund_list_allows(auth.uid(), o.id, 'manager') OR (EXISTS ( SELECT 1
           FROM investor_fund_access ia
          WHERE ((ia.offering_id = o.id) AND (ia.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM investor_applications a
          WHERE ((a.offering_id = o.id) AND (a.user_id = auth.uid()))))))));
ALTER POLICY "manager reads fund distribution batches" ON public.distribution_batches
  USING (private.fund_list_allows(auth.uid(), distribution_batches.offering_id, 'manager'));
ALTER POLICY "manager reads fund distribution lines" ON public.distribution_lines
  USING (private.fund_list_allows(auth.uid(), distribution_lines.offering_id, 'manager'));
ALTER POLICY "fund managers read their fund templates" ON public.signing_templates
  USING ((scope = 'harmonious'::text) OR ((scope = 'fund'::text) AND private.fund_list_allows(auth.uid(), signing_templates.offering_id, 'manager')) OR ((scope = 'company'::text) AND (EXISTS ( SELECT 1
   FROM ct_companies c
  WHERE (c.id = signing_templates.company_id)))));
ALTER POLICY "fund managers write their fund templates" ON public.signing_templates
  WITH CHECK (((scope = 'fund'::text) AND private.fund_list_allows(auth.uid(), signing_templates.offering_id, 'manager')) OR ((scope = 'company'::text) AND (EXISTS ( SELECT 1
   FROM ct_companies c
  WHERE (c.id = signing_templates.company_id)))));
ALTER POLICY "fund managers update their fund templates" ON public.signing_templates
  USING (((scope = 'fund'::text) AND private.fund_list_allows(auth.uid(), signing_templates.offering_id, 'manager')) OR ((scope = 'company'::text) AND (EXISTS ( SELECT 1
   FROM ct_companies c
  WHERE (c.id = signing_templates.company_id)))))
  WITH CHECK (((scope = 'fund'::text) AND private.fund_list_allows(auth.uid(), signing_templates.offering_id, 'manager')) OR ((scope = 'company'::text) AND (EXISTS ( SELECT 1
   FROM ct_companies c
  WHERE (c.id = signing_templates.company_id)))));
ALTER POLICY "template owners add versions" ON public.signing_template_versions
  WITH CHECK (EXISTS ( SELECT 1
   FROM signing_templates t
  WHERE ((t.id = signing_template_versions.template_id) AND (((t.scope = 'fund'::text) AND private.fund_list_allows(auth.uid(), t.offering_id, 'manager')) OR ((t.scope = 'company'::text) AND (EXISTS ( SELECT 1
           FROM ct_companies c
          WHERE (c.id = t.company_id))))))));
ALTER POLICY "template owners update draft versions" ON public.signing_template_versions
  USING ((status = 'draft'::text) AND (EXISTS ( SELECT 1
   FROM signing_templates t
  WHERE ((t.id = signing_template_versions.template_id) AND (((t.scope = 'fund'::text) AND private.fund_list_allows(auth.uid(), t.offering_id, 'manager')) OR ((t.scope = 'company'::text) AND (EXISTS ( SELECT 1
           FROM ct_companies c
          WHERE (c.id = t.company_id)))))))))
  WITH CHECK (EXISTS ( SELECT 1
   FROM signing_templates t
  WHERE (t.id = signing_template_versions.template_id)));
ALTER POLICY "Fund managers read their client fund payments" ON public.fund_payments
  USING (EXISTS ( SELECT 1 FROM offerings o WHERE ((o.client_id = fund_payments.client_id) AND private.fund_list_allows(auth.uid(), o.id, 'manager'))));
ALTER POLICY "Managers read their fund team grants" ON public.fund_team_grants
  USING (private.fund_list_allows(auth.uid(), fund_team_grants.offering_id, 'manager'));
ALTER POLICY "Managers read their fund team events" ON public.fund_team_grant_events
  USING (private.fund_list_allows(auth.uid(), fund_team_grant_events.offering_id, 'manager'));
ALTER POLICY "Managers read their fund drafts" ON public.fund_team_drafts
  USING (private.fund_list_allows(auth.uid(), fund_team_drafts.offering_id, 'manager'));
ALTER POLICY "Managers and staff read fund status events" ON public.fund_status_events
  USING (is_any_staff() OR private.fund_list_allows(auth.uid(), fund_status_events.offering_id, 'manager'));
ALTER POLICY "Managers and staff read reopen requests" ON public.fund_reopen_requests
  USING (is_any_staff() OR private.fund_list_allows(auth.uid(), fund_reopen_requests.offering_id, 'manager'));
ALTER POLICY "fund managers upload own fund EIN letter" ON storage.objects
  WITH CHECK ((bucket_id = 'fund-formation'::text) AND ((storage.foldername(name))[1] = 'fund-setup-restricted'::text) AND ((storage.foldername(name))[3] = 'ein-letter'::text) AND private.fund_list_allows_path(auth.uid(), (storage.foldername(objects.name))[2], 'manager'));
ALTER POLICY "wealth_selection_owner_read" ON public.wealth_service_selections
  USING ((owner_user_id = auth.uid()) AND ((offering_id IS NULL) OR private.fund_list_allows(auth.uid(), wealth_service_selections.offering_id, 'manager')));
ALTER POLICY "wealth_selection_owner_insert" ON public.wealth_service_selections
  WITH CHECK ((owner_user_id = auth.uid()) AND ((offering_id IS NULL) OR private.fund_list_allows(auth.uid(), wealth_service_selections.offering_id, 'manager')));