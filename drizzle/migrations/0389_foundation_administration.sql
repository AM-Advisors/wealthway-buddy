-- Foundation Administration, phase 1 (additive). Staff can record foundation profiles, people and authority,
-- private documents and draft quotes. Sending, contracting, enrollment and billing stay blocked by the
-- gates below until a separately approved release migration replaces them.

-- 1. Feature flags: off unless a row says enabled. Changes are logged append-only.
CREATE TABLE public.platform_feature_flags (
  key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  enabled boolean NOT NULL DEFAULT false,
  reason text NOT NULL CHECK (length(trim(reason)) >= 3),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.platform_feature_flags TO service_role;
ALTER TABLE public.platform_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.platform_feature_flag_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  enabled boolean NOT NULL,
  reason text NOT NULL,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.platform_feature_flag_events TO service_role;
ALTER TABLE public.platform_feature_flag_events ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.block_feature_flag_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Feature flag history is append-only'; END $$;
CREATE TRIGGER platform_feature_flag_events_append_only BEFORE UPDATE OR DELETE ON public.platform_feature_flag_events
  FOR EACH ROW EXECUTE FUNCTION public.block_feature_flag_event_mutation();

CREATE FUNCTION public.log_feature_flag_change() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Turn a feature flag off instead of deleting it'; END IF;
  INSERT INTO public.platform_feature_flag_events(key, enabled, reason, actor_id) VALUES (NEW.key, NEW.enabled, NEW.reason, NEW.updated_by);
  RETURN NEW;
END $$;
CREATE TRIGGER platform_feature_flags_logged AFTER INSERT OR UPDATE OR DELETE ON public.platform_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.log_feature_flag_change();

-- 2. Foundation profile: one per existing client entity. Legal name, jurisdiction and formation date stay on
-- client_entities; legal structure and charitable/tax classification are separate fields.
CREATE TABLE public.foundation_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  client_entity_id uuid NOT NULL UNIQUE REFERENCES public.client_entities(id),
  legal_structure text NOT NULL CHECK (legal_structure IN ('nonprofit_corporation','charitable_trust','llc','unincorporated_association','other')),
  legal_structure_other text CHECK (legal_structure_other IS NULL OR length(legal_structure_other) <= 200),
  classification text NOT NULL DEFAULT 'unknown' CHECK (classification IN ('private_nonoperating_foundation','private_operating_foundation','public_charity_509a1','public_charity_509a2','supporting_organization_509a3','donor_advised_fund_sponsor','other','unknown')),
  exemption_status text NOT NULL DEFAULT 'unknown' CHECK (exemption_status IN ('determined','pending','not_applied','revoked','unknown')),
  exemption_effective_on date,
  determination_letter_on date,
  fiscal_year_end_month smallint CHECK (fiscal_year_end_month BETWEEN 1 AND 12),
  mission text CHECK (mission IS NULL OR length(mission) <= 4000),
  primary_contact_person_id uuid REFERENCES public.persons(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.foundation_profiles TO service_role;
ALTER TABLE public.foundation_profiles ENABLE ROW LEVEL SECURITY;
CREATE INDEX foundation_profiles_client_idx ON public.foundation_profiles(client_id);

CREATE FUNCTION public.foundation_profile_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Foundation profiles are archived, never deleted'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.client_entity_id IS DISTINCT FROM OLD.client_entity_id OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'A foundation profile stays with its client and entity';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.client_entities e WHERE e.id = NEW.client_entity_id AND e.client_id = NEW.client_id) THEN
    RAISE EXCEPTION 'That entity does not belong to this client';
  END IF;
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM public.client_entities e WHERE e.id = NEW.client_entity_id AND (e.offering_id IS NOT NULL OR e.entity_type IN ('fund','spv','series'))) THEN
    RAISE EXCEPTION 'Funds, SPVs and series cannot be set up as foundations';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER foundation_profile_guard BEFORE INSERT OR UPDATE OR DELETE ON public.foundation_profiles
  FOR EACH ROW EXECUTE FUNCTION public.foundation_profile_guard();

CREATE TABLE public.foundation_profile_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundation_profile_id uuid NOT NULL REFERENCES public.foundation_profiles(id),
  actor_id uuid,
  event text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.foundation_profile_events TO service_role;
ALTER TABLE public.foundation_profile_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX foundation_profile_events_profile_idx ON public.foundation_profile_events(foundation_profile_id, created_at);
CREATE FUNCTION public.block_foundation_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Foundation history is append-only'; END $$;
CREATE TRIGGER foundation_profile_events_append_only BEFORE UPDATE OR DELETE ON public.foundation_profile_events
  FOR EACH ROW EXECUTE FUNCTION public.block_foundation_event_mutation();

-- 3. Private foundation documents (private client-contracts bucket). Replacements supersede; nothing is deleted.
CREATE TABLE public.foundation_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundation_profile_id uuid NOT NULL REFERENCES public.foundation_profiles(id),
  kind text NOT NULL CHECK (kind IN ('governing_document','determination_letter','authority_evidence','supporting_evidence')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 200),
  storage_bucket text NOT NULL DEFAULT 'client-contracts' CHECK (storage_bucket = 'client-contracts'),
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  superseded_by uuid REFERENCES public.foundation_documents(id),
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.foundation_documents TO service_role;
ALTER TABLE public.foundation_documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX foundation_documents_profile_idx ON public.foundation_documents(foundation_profile_id);
CREATE FUNCTION public.foundation_document_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Foundation documents are retained; upload a replacement instead'; END IF;
  IF OLD.superseded_by IS NOT NULL OR NEW.superseded_by IS NULL
     OR (to_jsonb(NEW) - 'superseded_by') IS DISTINCT FROM (to_jsonb(OLD) - 'superseded_by') THEN
    RAISE EXCEPTION 'A foundation document can only be marked as replaced, once';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER foundation_document_guard BEFORE UPDATE OR DELETE ON public.foundation_documents
  FOR EACH ROW EXECUTE FUNCTION public.foundation_document_guard();

-- 4. People and authority: canonical Persons with an explicit role, scope and evidence.
-- Paperwork preparers can only ever hold prepare_paperwork. Recording authority grants no platform access.
CREATE TABLE public.foundation_authority_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundation_profile_id uuid NOT NULL REFERENCES public.foundation_profiles(id),
  person_id uuid NOT NULL REFERENCES public.persons(id),
  role text NOT NULL CHECK (role IN ('director','trustee','officer','authorized_signer','paperwork_preparer','approver')),
  title text CHECK (title IS NULL OR length(title) <= 200),
  authority_scopes text[] NOT NULL DEFAULT '{}'::text[]
    CHECK (authority_scopes <@ ARRAY['sign_agreements','approve_grants','approve_payments','banking','submit_verification','approve_documents','board_vote','prepare_paperwork']::text[]),
  evidence_document_id uuid REFERENCES public.foundation_documents(id),
  evidence_note text CHECK (evidence_note IS NULL OR length(evidence_note) <= 1000),
  effective_on date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  ended_on date,
  ended_reason text,
  ended_by uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT foundation_preparer_scope CHECK (role <> 'paperwork_preparer' OR authority_scopes <@ ARRAY['prepare_paperwork']::text[]),
  CONSTRAINT foundation_authority_evidence CHECK (authority_scopes <@ ARRAY['prepare_paperwork']::text[] OR evidence_document_id IS NOT NULL),
  CONSTRAINT foundation_authority_ended CHECK ((status = 'active' AND ended_on IS NULL) OR (status = 'ended' AND ended_on IS NOT NULL AND length(trim(coalesce(ended_reason,''))) >= 3 AND ended_by IS NOT NULL))
);
GRANT ALL ON public.foundation_authority_roles TO service_role;
ALTER TABLE public.foundation_authority_roles ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX foundation_authority_one_active ON public.foundation_authority_roles(foundation_profile_id, person_id, role) WHERE status = 'active';
CREATE FUNCTION public.foundation_authority_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Authority records are ended, never deleted'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.evidence_document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.foundation_documents d WHERE d.id = NEW.evidence_document_id AND d.foundation_profile_id = NEW.foundation_profile_id) THEN
      RAISE EXCEPTION 'Authority evidence must be a document of this foundation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'active' OR NEW.status <> 'ended'
     OR (to_jsonb(NEW) - ARRAY['status','ended_on','ended_reason','ended_by']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','ended_on','ended_reason','ended_by']) THEN
    RAISE EXCEPTION 'Authority can only be ended; record a new entry for any change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER foundation_authority_guard BEFORE INSERT OR UPDATE OR DELETE ON public.foundation_authority_roles
  FOR EACH ROW EXECUTE FUNCTION public.foundation_authority_guard();

-- 5. Entity tax ID vault (AES-GCM ciphertext from the canonical tax-ID key; service role only).
CREATE TABLE IF NOT EXISTS private.client_entity_tax_ids (
  client_entity_id uuid PRIMARY KEY REFERENCES public.client_entities(id),
  ciphertext text NOT NULL,
  iv text NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.client_entity_tax_ids FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.client_entity_tax_ids TO service_role;
CREATE FUNCTION public.store_client_entity_tax_id(_entity uuid, _ciphertext text, _iv text, _key_version int, _last4 text, _actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF _last4 !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'Invalid tax ID'; END IF;
  INSERT INTO private.client_entity_tax_ids(client_entity_id, ciphertext, iv, key_version, updated_by, updated_at)
  VALUES (_entity, _ciphertext, _iv, _key_version, _actor, now())
  ON CONFLICT (client_entity_id) DO UPDATE SET ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv, key_version = EXCLUDED.key_version, updated_by = EXCLUDED.updated_by, updated_at = now();
  UPDATE public.client_entities SET tax_id_masked = '•••••' || _last4, tax_id_status = 'issued', updated_at = now() WHERE id = _entity;
END $$;
REVOKE ALL ON FUNCTION public.store_client_entity_tax_id(uuid, text, text, int, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_client_entity_tax_id(uuid, text, text, int, text, uuid) TO service_role;

-- 6. Quotes: foundation terms are frozen on the line. Drafts save; approval of negotiated prices needs an
-- executive; sending, SOWs, signing, invoices, contracted pricing and engagements are blocked until release.
ALTER TABLE public.sales_quote_lines ADD COLUMN foundation_snapshot jsonb;
COMMENT ON COLUMN public.sales_quote_lines.foundation_snapshot IS 'Frozen Foundation Administration terms for this line. Unreleased: never authority for sending, contracting, enrollment, invoices, access or money movement.';

CREATE FUNCTION public.foundation_quote_line_gate() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE q record; prof record;
BEGIN
  IF NEW.service_key NOT LIKE 'FOUNDATION_ADMIN:%' AND NEW.foundation_snapshot IS NULL THEN RETURN NEW; END IF;
  IF NEW.service_key NOT LIKE 'FOUNDATION_ADMIN:%' OR NEW.foundation_snapshot IS NULL THEN
    RAISE EXCEPTION 'Foundation Administration lines need their recorded foundation terms';
  END IF;
  SELECT id, client_id, status, needs_exec_approval INTO q FROM public.sales_quotes WHERE id = NEW.quote_id;
  IF q.id IS NULL OR q.status NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'Foundation Administration can only be added to draft quotes'; END IF;
  SELECT id, client_id, client_entity_id, status INTO prof FROM public.foundation_profiles WHERE id = (NEW.foundation_snapshot->>'foundationProfileId')::uuid;
  IF prof.id IS NULL OR prof.status <> 'active' OR prof.client_id IS DISTINCT FROM q.client_id OR prof.client_entity_id::text IS DISTINCT FROM NEW.foundation_snapshot->>'clientEntityId' THEN
    RAISE EXCEPTION 'Foundation Administration must name an active foundation of this quote''s client';
  END IF;
  IF NEW.unit_cents IS NULL OR NEW.unit_cents <= 0 THEN RAISE EXCEPTION 'Foundation Administration needs an explicit price; it is never $0 by default'; END IF;
  IF NEW.foundation_snapshot->>'priceSource' IS DISTINCT FROM 'rate_card' AND NOT q.needs_exec_approval THEN
    RAISE EXCEPTION 'Negotiated Foundation Administration pricing needs executive approval';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER foundation_quote_line_gate BEFORE INSERT OR UPDATE ON public.sales_quote_lines
  FOR EACH ROW EXECUTE FUNCTION public.foundation_quote_line_gate();

CREATE FUNCTION public.foundation_quote_gate() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE has_f boolean; negotiated boolean;
BEGIN
  SELECT bool_or(true), bool_or(foundation_snapshot->>'priceSource' IS DISTINCT FROM 'rate_card') INTO has_f, negotiated
    FROM public.sales_quote_lines WHERE quote_id = NEW.id AND foundation_snapshot IS NOT NULL;
  IF NOT coalesce(has_f, false) THEN RETURN NEW; END IF;
  IF NEW.status IN ('sent','signed') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Foundation Administration is not released yet: this quote cannot be sent or signed';
  END IF;
  IF NEW.sow_id IS NOT NULL AND NEW.sow_id IS DISTINCT FROM OLD.sow_id THEN
    RAISE EXCEPTION 'Foundation Administration is not released yet: no SOW can be drafted from this quote';
  END IF;
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' AND (coalesce(negotiated, false) OR NEW.needs_exec_approval) THEN
    IF NEW.approved_by IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = NEW.approved_by AND r.role::text IN ('executive','cro','super_admin')) THEN
      RAISE EXCEPTION 'Negotiated Foundation Administration pricing needs executive approval';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER foundation_quote_gate BEFORE UPDATE ON public.sales_quotes
  FOR EACH ROW EXECUTE FUNCTION public.foundation_quote_gate();

CREATE FUNCTION public.foundation_unreleased_key_gate() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.service_key LIKE 'FOUNDATION_ADMIN:%' THEN
    RAISE EXCEPTION 'Foundation Administration is not released yet: it cannot be contracted, enrolled or billed (%)', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER foundation_unreleased_invoice_lines BEFORE INSERT OR UPDATE OF service_key ON public.invoice_lines FOR EACH ROW EXECUTE FUNCTION public.foundation_unreleased_key_gate();
CREATE TRIGGER foundation_unreleased_client_pricing BEFORE INSERT OR UPDATE OF service_key ON public.client_pricing FOR EACH ROW EXECUTE FUNCTION public.foundation_unreleased_key_gate();
CREATE TRIGGER foundation_unreleased_engagement_services BEFORE INSERT OR UPDATE OF service_key ON public.engagement_services FOR EACH ROW EXECUTE FUNCTION public.foundation_unreleased_key_gate();
CREATE TRIGGER foundation_unreleased_service_selections BEFORE INSERT OR UPDATE OF service_key ON public.client_service_selections FOR EACH ROW EXECUTE FUNCTION public.foundation_unreleased_key_gate();
CREATE TRIGGER foundation_unreleased_sow_pricing_lines BEFORE INSERT OR UPDATE OF service_key ON public.sow_pricing_lines FOR EACH ROW EXECUTE FUNCTION public.foundation_unreleased_key_gate();

CREATE FUNCTION public.foundation_unreleased_sow_gate() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.generated_lines IS NOT NULL AND jsonb_typeof(NEW.generated_lines) = 'array' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.generated_lines) e WHERE e->>'service_key' LIKE 'FOUNDATION_ADMIN:%' OR e ? 'foundation_snapshot' AND e->'foundation_snapshot' <> 'null'::jsonb
  ) THEN
    RAISE EXCEPTION 'Foundation Administration is not released yet: it cannot appear on an SOW';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER foundation_unreleased_sow BEFORE INSERT OR UPDATE OF generated_lines ON public.client_sows FOR EACH ROW EXECUTE FUNCTION public.foundation_unreleased_sow_gate();

CREATE FUNCTION public.foundation_unreleased_document_gate() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.quote_id IS NOT NULL AND NEW.sent_at IS NOT NULL AND OLD.sent_at IS NULL
     AND EXISTS (SELECT 1 FROM public.sales_quote_lines l WHERE l.quote_id = NEW.quote_id AND l.foundation_snapshot IS NOT NULL) THEN
    RAISE EXCEPTION 'Foundation Administration is not released yet: proposals that include it cannot be sent';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER foundation_unreleased_documents BEFORE UPDATE OF sent_at ON public.sales_documents FOR EACH ROW EXECUTE FUNCTION public.foundation_unreleased_document_gate();

-- Canonical draft save now carries foundation terms (otherwise identical to 0335).
CREATE OR REPLACE FUNCTION public.save_linked_quote_draft(p_quote_id uuid, p_actor_id uuid, p_expected_at timestamptz, p_row jsonb, p_lines jsonb, p_sow_lines jsonb, p_services text, p_pricing text, p_sow_patch jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q public.sales_quotes%ROWTYPE; s public.client_sows%ROWTYPE; r public.sales_quotes%ROWTYPE; sp public.client_sows%ROWTYPE; snap uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=p_actor_id AND role::text IN ('account_executive','sales','sales_management','cro','executive','super_admin')) THEN RAISE EXCEPTION 'Quote editing authority required'; END IF;
  SELECT * INTO q FROM public.sales_quotes WHERE id=p_quote_id FOR UPDATE;
  IF NOT FOUND OR q.status NOT IN ('draft','rejected') OR q.updated_at IS DISTINCT FROM p_expected_at THEN RAISE EXCEPTION 'Quote changed. Refresh before saving'; END IF;
  IF q.sow_id IS NOT NULL THEN
    SELECT * INTO s FROM public.client_sows WHERE id=q.sow_id FOR UPDATE;
    IF NOT FOUND OR s.client_id IS DISTINCT FROM q.client_id OR s.status <> 'draft' OR coalesce(s.stage,'draft') <> 'draft' OR s.locked OR s.client_signed_at IS NOT NULL OR s.executed_at IS NOT NULL OR s.signed_on IS NOT NULL THEN RAISE EXCEPTION 'SOW under review or signed. Create a new version or amendment'; END IF;
    IF EXISTS (SELECT 1 FROM public.agreement_signatures WHERE sow_id=s.id) OR EXISTS (SELECT 1 FROM public.sow_section_approvals WHERE sow_id=s.id) OR EXISTS (SELECT 1 FROM public.sow_pricing_snapshots WHERE sow_id=s.id AND locked) THEN RAISE EXCEPTION 'SOW has recorded approval or signature. Create a new version'; END IF;
    IF EXISTS (SELECT 1 FROM public.sales_quotes WHERE sow_id=s.id AND id<>q.id AND status<>'superseded') THEN RAISE EXCEPTION 'SOW has multiple current quotes. Resolve its links first'; END IF;
  END IF;
  r := jsonb_populate_record(q,p_row);
  IF q.sow_id IS NOT NULL AND r.client_id IS DISTINCT FROM q.client_id THEN RAISE EXCEPTION 'A linked agreement cannot move to another client'; END IF;
  IF jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'Add at least one service'; END IF;
  UPDATE public.sales_quotes SET title=r.title, client_id=r.client_id, contact_id=r.contact_id, deal_id=r.deal_id, offering_id=r.offering_id, valid_until=r.valid_until, notes=r.notes, sections=coalesce(r.sections, sales_quotes.sections), total_cents=r.total_cents, baseline_cents=r.baseline_cents, needs_exec_approval=r.needs_exec_approval, pricing_version_id=r.pricing_version_id, status='draft', approved_by=NULL, approved_at=NULL, updated_at=clock_timestamp() WHERE id=q.id;
  DELETE FROM public.sales_quote_lines WHERE quote_id=q.id;
  INSERT INTO public.sales_quote_lines (quote_id,service_key,label,quantity,unit_cents,baseline_unit_cents,line_cents,sort_order,billing_frequency,first_bill_on,bookkeeping_snapshot,foundation_snapshot,service_details)
    SELECT q.id,x.service_key,x.label,x.quantity,x.unit_cents,x.baseline_unit_cents,x.line_cents,x.sort_order,x.billing_frequency,x.first_bill_on,x.bookkeeping_snapshot,x.foundation_snapshot,x.service_details FROM jsonb_to_recordset(p_lines) AS x(service_key text,label text,quantity numeric,unit_cents bigint,baseline_unit_cents bigint,line_cents bigint,sort_order integer,billing_frequency text,first_bill_on date,bookkeeping_snapshot jsonb,foundation_snapshot jsonb,service_details jsonb);
  IF q.sow_id IS NOT NULL THEN
    sp := jsonb_populate_record(s,coalesce(p_sow_patch,'{}'));
    IF sp.client_id IS DISTINCT FROM s.client_id OR sp.status <> 'draft' OR sp.signed_on IS NOT NULL THEN RAISE EXCEPTION 'Signing and activation use the agreement approval flow'; END IF;
    UPDATE public.client_sows SET title=r.title, offering_id=r.offering_id, generated_lines=p_sow_lines,
      effective_date=sp.effective_date,termination_date=sp.termination_date,notice_days=sp.notice_days,eligibility=sp.eligibility,
      notes=CASE WHEN p_sow_patch IS NULL THEN s.notes ELSE sp.notes END,updated_at=clock_timestamp() WHERE id=s.id;
    UPDATE public.sow_sections SET body=CASE key WHEN 'services' THEN p_services ELSE p_pricing END,updated_at=clock_timestamp() WHERE sow_id=s.id AND key IN ('services','pricing');
    SELECT id INTO snap FROM public.sow_pricing_snapshots WHERE sow_id=s.id;
    IF snap IS NOT NULL THEN
      DELETE FROM public.sow_pricing_lines WHERE snapshot_id=snap;
      INSERT INTO public.sow_pricing_lines(snapshot_id,service_key,label,pricing_model,standard_cents,final_cents,sort_order)
        SELECT snap,x.service_key,x.label,x.billing_frequency,round(x.quantity*x.baseline_unit_cents),x.line_cents,x.sort_order FROM jsonb_to_recordset(p_lines) AS x(service_key text,label text,quantity numeric,baseline_unit_cents bigint,line_cents bigint,sort_order integer,billing_frequency text);
    END IF;
    INSERT INTO public.contract_audit_events(actor_id,client_id,area,action,target,previous_value,new_value,source) VALUES(p_actor_id,s.client_id,'sow','quote_sow_synchronized',s.id::text,jsonb_build_object('title',s.title,'generated_lines',s.generated_lines),jsonb_build_object('title',r.title,'generated_lines',p_sow_lines),'linked_edit');
  END IF;
  INSERT INTO public.sales_quote_events(quote_id,event,actor_id,note) VALUES(q.id,'edited',p_actor_id,CASE WHEN q.sow_id IS NULL THEN 'Draft saved' ELSE 'Quote and SOW synchronized' END);
  RETURN q.id;
END $$;
REVOKE ALL ON FUNCTION public.save_linked_quote_draft(uuid,uuid,timestamptz,jsonb,jsonb,jsonb,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_linked_quote_draft(uuid,uuid,timestamptz,jsonb,jsonb,jsonb,text,text,jsonb) TO service_role;

COMMENT ON TABLE public.foundation_profiles IS 'Foundation Administration service relationship for an existing client entity. Distinct from any investment profile the same foundation uses to invest; never creates a fund.';
COMMENT ON TABLE public.platform_feature_flags IS 'Server-read feature switches. Missing row means off. Changed only by Super Admin with a reason.';