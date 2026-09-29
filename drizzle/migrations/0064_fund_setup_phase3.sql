ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS banking_path text,
  ADD COLUMN IF NOT EXISTS banking_not_required_reason text,
  ADD COLUMN IF NOT EXISTS harmonious_bank_status text,
  ADD COLUMN IF NOT EXISTS ein_path text,
  ADD COLUMN IF NOT EXISTS ein_workflow_status text,
  ADD COLUMN IF NOT EXISTS ss4_responsible_person_id uuid REFERENCES public.persons(id),
  ADD COLUMN IF NOT EXISTS ss4_generated_form_version text,
  ADD COLUMN IF NOT EXISTS ss4_snapshot_hash text,
  ADD COLUMN IF NOT EXISTS admin_services jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS form_d_responsibility text,
  ADD COLUMN IF NOT EXISTS blue_sky_responsibility text;

ALTER TABLE public.offerings
  ADD CONSTRAINT offerings_banking_path_chk CHECK (banking_path IS NULL OR banking_path IN ('harmonious','client','not_required')),
  ADD CONSTRAINT offerings_harmonious_bank_status_chk CHECK (harmonious_bank_status IS NULL OR harmonious_bank_status IN ('not_started','information_needed','in_progress','account_opened','wire_pending_verification','funding_instructions_ready')),
  ADD CONSTRAINT offerings_ein_path_chk CHECK (ein_path IS NULL OR ein_path IN ('existing','harmonious')),
  ADD CONSTRAINT offerings_ein_workflow_status_chk CHECK (ein_workflow_status IS NULL OR ein_workflow_status IN ('information_needed','ready_for_review','awaiting_signature','ready_for_submission','submitted','ein_received','needs_attention')),
  ADD CONSTRAINT offerings_form_d_resp_chk CHECK (form_d_responsibility IS NULL OR form_d_responsibility IN ('not_applicable','required','harmonious','client_counsel')),
  ADD CONSTRAINT offerings_blue_sky_resp_chk CHECK (blue_sky_responsibility IS NULL OR blue_sky_responsibility IN ('not_applicable','required','harmonious','client_counsel'));

CREATE TABLE private.offering_bank_instruction_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  version integer NOT NULL,
  details jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification','verified','rejected')),
  ownership_review text NOT NULL DEFAULT 'not_needed' CHECK (ownership_review IN ('not_needed','review_required','accepted')),
  ownership_explanation text,
  wire_document_id uuid,
  verified_by uuid,
  verified_at timestamptz,
  verification_method text,
  rejection_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_id, version)
);

CREATE OR REPLACE FUNCTION private.protect_bank_instruction_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Bank instruction history is permanent'; END IF;
  IF NEW.details IS DISTINCT FROM OLD.details OR NEW.version <> OLD.version OR NEW.offering_id <> OLD.offering_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Bank instructions cannot be rewritten; enter a new version';
  END IF;
  IF OLD.status = 'verified' AND NEW.status <> 'verified' THEN
    RAISE EXCEPTION 'A verified version stays verified; enter a new version instead';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bank_instruction_versions_protect BEFORE UPDATE OR DELETE ON private.offering_bank_instruction_versions
  FOR EACH ROW EXECUTE FUNCTION private.protect_bank_instruction_version();

INSERT INTO private.offering_bank_instruction_versions (offering_id, version, details, status, created_at)
SELECT w.offering_id, 1, w.details, 'pending_verification', w.updated_at
FROM private.offering_wire_instructions w
WHERE w.details <> '{}'::jsonb;

CREATE OR REPLACE FUNCTION private.norm_name(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(lower(coalesce(t,'')), '[^a-z0-9]', '', 'g')
$$;

CREATE OR REPLACE FUNCTION public.save_wire_instructions(p_offering_id uuid, p_details jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_prev jsonb;
  v_next integer;
  v_legal text;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = p_offering_id AND fm.user_id = auth.uid())
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
$function$;

CREATE OR REPLACE FUNCTION public.get_wire_instructions(p_offering_id uuid)
 RETURNS TABLE(offering_id uuid, details jsonb, updated_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_read_wire_instructions(p_offering_id) THEN
    RAISE EXCEPTION 'Not authorized to read wire instructions';
  END IF;
  IF private.has_role(auth.uid(), 'admin'::public.app_role)
     OR EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = p_offering_id AND fm.user_id = auth.uid()) THEN
    RETURN QUERY SELECT w.offering_id, w.details, w.updated_at FROM private.offering_wire_instructions w WHERE w.offering_id = p_offering_id;
    RETURN;
  END IF;
  RETURN QUERY
    SELECT v.offering_id, v.details, v.verified_at
    FROM private.offering_bank_instruction_versions v
    WHERE v.offering_id = p_offering_id
      AND v.version = (SELECT MAX(x.version) FROM private.offering_bank_instruction_versions x WHERE x.offering_id = p_offering_id)
      AND v.status = 'verified'
      AND v.ownership_review <> 'review_required';
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_wire_instructions_for_packet(p_offering_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT v.details FROM private.offering_bank_instruction_versions v
  WHERE v.offering_id = p_offering_id
    AND v.version = (SELECT MAX(x.version) FROM private.offering_bank_instruction_versions x WHERE x.offering_id = p_offering_id)
    AND v.status = 'verified' AND v.ownership_review <> 'review_required';
$function$;

CREATE OR REPLACE FUNCTION public.list_bank_instruction_versions(p_offering_id uuid)
 RETURNS TABLE(version integer, status text, ownership_review text, bank_name text, account_name text,
   account_last4 text, routing_last4 text, has_swift boolean, has_ffc boolean, wire_document_id uuid,
   verified_at timestamptz, verified_by uuid, verification_method text, rejection_reason text,
   ownership_explanation text, created_by uuid, created_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_staff boolean := private.has_role(auth.uid(), 'admin'::public.app_role);
BEGIN
  IF NOT public.can_manage_diligence(p_offering_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT v.version, v.status, v.ownership_review, v.details->>'bank_name', v.details->>'account_name',
      right(coalesce(v.details->>'account_number',''), 4), right(coalesce(v.details->>'routing_number',''), 4),
      coalesce(v.details->>'swift','') <> '', coalesce(v.details->>'memo','') <> '', v.wire_document_id,
      v.verified_at, CASE WHEN v_staff THEN v.verified_by END, v.verification_method,
      CASE WHEN v_staff THEN v.rejection_reason END, CASE WHEN v_staff THEN v.ownership_explanation END,
      CASE WHEN v_staff THEN v.created_by END, v.created_at
    FROM private.offering_bank_instruction_versions v
    WHERE v.offering_id = p_offering_id ORDER BY v.version DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.review_bank_instruction_version(
  p_offering_id uuid, p_version integer, p_decision text, p_method text, p_note text, p_wire_document_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; v_latest integer;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only Harmonious can review bank instructions';
  END IF;
  SELECT * INTO r FROM private.offering_bank_instruction_versions WHERE offering_id = p_offering_id AND version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'That version was not found'; END IF;
  SELECT MAX(version) INTO v_latest FROM private.offering_bank_instruction_versions WHERE offering_id = p_offering_id;
  IF p_decision = 'attach_document' THEN
    UPDATE private.offering_bank_instruction_versions SET wire_document_id = p_wire_document_id WHERE id = r.id;
  ELSIF p_decision = 'accept_ownership' THEN
    IF coalesce(trim(p_note),'') = '' THEN RAISE EXCEPTION 'Explain why the account name is acceptable'; END IF;
    UPDATE private.offering_bank_instruction_versions SET ownership_review = 'accepted', ownership_explanation = p_note WHERE id = r.id;
  ELSIF p_decision = 'verify' THEN
    IF p_version <> v_latest THEN RAISE EXCEPTION 'Only the current version can be verified'; END IF;
    IF r.status <> 'pending_verification' THEN RAISE EXCEPTION 'This version is not awaiting verification'; END IF;
    IF r.ownership_review = 'review_required' THEN RAISE EXCEPTION 'Resolve the account ownership review first'; END IF;
    IF r.created_by IS NOT NULL AND r.created_by = auth.uid() THEN RAISE EXCEPTION 'A different person must verify instructions they entered'; END IF;
    IF coalesce(trim(p_method),'') = '' THEN RAISE EXCEPTION 'Record how the instructions were verified'; END IF;
    UPDATE private.offering_bank_instruction_versions SET status = 'verified', verified_by = auth.uid(), verified_at = now(), verification_method = p_method WHERE id = r.id;
  ELSIF p_decision = 'reject' THEN
    IF r.status <> 'pending_verification' THEN RAISE EXCEPTION 'This version is not awaiting verification'; END IF;
    UPDATE private.offering_bank_instruction_versions SET status = 'rejected', rejection_reason = p_note WHERE id = r.id;
  ELSE
    RAISE EXCEPTION 'Unknown decision';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_offering_entity_details(p_offering_id uuid)
 RETURNS TABLE(offering_id uuid, has_ein boolean, ein text, ss4 jsonb, ss4_storage_path text, ss4_generated_at timestamp with time zone, updated_at timestamp with time zone, ein_review_status text, ss4_review_status text, reviewed_at timestamp with time zone, review_note text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_staff boolean := private.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_review_operations();
BEGIN
  IF NOT (public.can_manage_diligence(p_offering_id) OR public.can_review_operations()) THEN
    RAISE EXCEPTION 'Not authorized to read this fund''s entity details';
  END IF;
  RETURN QUERY
    SELECT e.offering_id, e.has_ein, e.ein,
           CASE WHEN v_staff THEN e.ss4
                ELSE (e.ss4 - 'responsible_party_tin') || CASE WHEN coalesce(e.ss4->>'responsible_party_tin','') <> ''
                  THEN jsonb_build_object('responsible_party_tin_last4', right(e.ss4->>'responsible_party_tin', 4)) ELSE '{}'::jsonb END END,
           e.ss4_storage_path, e.ss4_generated_at,
           e.updated_at, e.ein_review_status, e.ss4_review_status, e.reviewed_at, e.review_note
    FROM private.offering_entity_details e
    WHERE e.offering_id = p_offering_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.list_bank_instruction_versions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_bank_instruction_version(uuid, integer, text, text, text, uuid) TO authenticated;