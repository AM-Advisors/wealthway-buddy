-- Foundation Administration: client onboarding submissions, document review, foundation verification review
-- decisions and per-component release controls. Additive; nothing is released and no client sees anything
-- until the separate client-onboarding switch is turned on.

-- 1. Who supplied each foundation document. Existing rows were recorded by Harmonious staff.
ALTER TABLE public.foundation_documents ADD COLUMN source text NOT NULL DEFAULT 'staff' CHECK (source IN ('staff','client'));

-- 2. Document review: client uploads stay pending until someone other than the uploader reviews them.
CREATE TABLE public.foundation_document_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.foundation_documents(id),
  decision text NOT NULL CHECK (decision IN ('accepted','correction_requested')),
  note text CHECK (note IS NULL OR length(note) <= 1000),
  reviewed_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT foundation_document_review_note CHECK (decision = 'accepted' OR length(trim(coalesce(note,''))) >= 3)
);
GRANT ALL ON public.foundation_document_reviews TO service_role;
ALTER TABLE public.foundation_document_reviews ENABLE ROW LEVEL SECURITY;
CREATE INDEX foundation_document_reviews_doc_idx ON public.foundation_document_reviews(document_id, created_at);

CREATE FUNCTION public.foundation_document_review_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE d record;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Document reviews are append-only'; END IF;
  SELECT id, uploaded_by, superseded_by INTO d FROM public.foundation_documents WHERE id = NEW.document_id;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF d.uploaded_by = NEW.reviewed_by THEN RAISE EXCEPTION 'Someone other than the uploader must review a document'; END IF;
  IF d.superseded_by IS NOT NULL THEN RAISE EXCEPTION 'Only the current version of a document can be reviewed'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER foundation_document_review_guard BEFORE INSERT OR UPDATE OR DELETE ON public.foundation_document_reviews
  FOR EACH ROW EXECUTE FUNCTION public.foundation_document_review_guard();

-- Usable as evidence: recorded by staff, or uploaded by the client and accepted on its latest review.
CREATE FUNCTION public.foundation_document_usable(_doc uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.foundation_documents d WHERE d.id = _doc AND d.superseded_by IS NULL AND (
      d.source = 'staff' OR (SELECT r.decision FROM public.foundation_document_reviews r WHERE r.document_id = d.id ORDER BY r.created_at DESC, r.id DESC LIMIT 1) = 'accepted'))
$$;
REVOKE ALL ON FUNCTION public.foundation_document_usable(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.foundation_document_usable(uuid) TO service_role;

-- Authority evidence must be a current, usable document of this foundation (client uploads need acceptance).
CREATE OR REPLACE FUNCTION public.foundation_authority_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Authority records are ended, never deleted'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.evidence_document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.foundation_documents d WHERE d.id = NEW.evidence_document_id AND d.foundation_profile_id = NEW.foundation_profile_id) THEN
      RAISE EXCEPTION 'Authority evidence must be a document of this foundation';
    END IF;
    IF NEW.evidence_document_id IS NOT NULL AND NOT public.foundation_document_usable(NEW.evidence_document_id) THEN
      RAISE EXCEPTION 'Authority evidence must be a current document that has been reviewed and accepted';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'active' OR NEW.status <> 'ended'
     OR (to_jsonb(NEW) - ARRAY['status','ended_on','ended_reason','ended_by']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','ended_on','ended_reason','ended_by']) THEN
    RAISE EXCEPTION 'Authority can only be ended; record a new entry for any change';
  END IF;
  RETURN NEW;
END $$;

-- 3. Client submissions: proposed facts and people requests, kept apart from reviewed records.
CREATE TABLE public.foundation_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundation_profile_id uuid NOT NULL REFERENCES public.foundation_profiles(id),
  kind text NOT NULL CHECK (kind IN ('profile_facts','person_existing','person_new','ready_for_review')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  base jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','accepted','correction_requested','withdrawn')),
  submitted_by uuid NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 2000),
  resolution jsonb,
  CONSTRAINT foundation_submission_review CHECK (
    (status = 'submitted' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('accepted','correction_requested','withdrawn') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CONSTRAINT foundation_submission_correction_note CHECK (status <> 'correction_requested' OR length(trim(coalesce(review_note,''))) >= 3)
);
GRANT ALL ON public.foundation_submissions TO service_role;
ALTER TABLE public.foundation_submissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX foundation_submissions_profile_idx ON public.foundation_submissions(foundation_profile_id, status);

CREATE FUNCTION public.foundation_submission_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Submissions are kept; withdraw instead'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'submitted' THEN RAISE EXCEPTION 'A submission starts as submitted'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'submitted' THEN RAISE EXCEPTION 'This submission was already decided'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status','reviewed_by','reviewed_at','review_note','resolution']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','reviewed_by','reviewed_at','review_note','resolution']) THEN
    RAISE EXCEPTION 'Submitted information cannot be changed; submit again instead';
  END IF;
  IF NEW.status = 'withdrawn' AND NEW.reviewed_by IS DISTINCT FROM OLD.submitted_by THEN RAISE EXCEPTION 'Only the submitter can withdraw'; END IF;
  IF NEW.status IN ('accepted','correction_requested') AND NEW.reviewed_by = OLD.submitted_by THEN RAISE EXCEPTION 'Submitted information never approves itself'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER foundation_submission_guard BEFORE INSERT OR UPDATE OR DELETE ON public.foundation_submissions
  FOR EACH ROW EXECUTE FUNCTION public.foundation_submission_guard();

-- 4. Foundation (entity) verification review decisions. Screening results are never recorded here.
CREATE TABLE public.foundation_verification_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundation_profile_id uuid NOT NULL REFERENCES public.foundation_profiles(id),
  requirement text NOT NULL CHECK (requirement IN ('entity_records')),
  decision text NOT NULL CHECK (decision IN ('approved','declined','more_information')),
  evidence_document_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  note text NOT NULL CHECK (length(trim(note)) BETWEEN 3 AND 2000),
  decided_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.foundation_verification_reviews TO service_role;
ALTER TABLE public.foundation_verification_reviews ENABLE ROW LEVEL SECURITY;
CREATE INDEX foundation_verification_reviews_profile_idx ON public.foundation_verification_reviews(foundation_profile_id, created_at);

CREATE FUNCTION public.foundation_verification_review_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE prof record; doc uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Verification decisions are append-only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = NEW.decided_by AND r.role::text IN ('compliance','admin','super_admin')) THEN
    RAISE EXCEPTION 'Only Compliance or an administrator can decide foundation verification';
  END IF;
  SELECT id, client_entity_id INTO prof FROM public.foundation_profiles WHERE id = NEW.foundation_profile_id;
  FOREACH doc IN ARRAY NEW.evidence_document_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.foundation_documents d WHERE d.id = doc AND d.foundation_profile_id = NEW.foundation_profile_id) THEN
      RAISE EXCEPTION 'Evidence must be documents of this foundation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.foundation_documents d WHERE d.id = doc AND d.uploaded_by = NEW.decided_by) THEN
      RAISE EXCEPTION 'Someone other than the uploader must decide on that evidence';
    END IF;
  END LOOP;
  IF NEW.decision = 'approved' THEN
    IF NOT EXISTS (SELECT 1 FROM unnest(NEW.evidence_document_ids) x JOIN public.foundation_documents d ON d.id = x WHERE d.kind = 'governing_document' AND public.foundation_document_usable(d.id)) THEN
      RAISE EXCEPTION 'Approval needs a current, accepted governing document as evidence';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(NEW.evidence_document_ids) x WHERE NOT public.foundation_document_usable(x)) THEN
      RAISE EXCEPTION 'Every evidence document must be current and accepted';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.client_entities e WHERE e.id = prof.client_entity_id AND e.tax_id_status = 'issued') THEN
      RAISE EXCEPTION 'Approval needs the foundation''s EIN on file';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER foundation_verification_review_guard BEFORE INSERT OR UPDATE OR DELETE ON public.foundation_verification_reviews
  FOR EACH ROW EXECUTE FUNCTION public.foundation_verification_review_guard();

-- 5. Component release controls: request with recorded evidence, approval by a different Super Admin,
-- append-only history. Commercial release and delivery readiness are separate; money movement is not releasable here.
CREATE TABLE public.foundation_component_release_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component text NOT NULL CHECK (component IN ('onboarding_setup','governance_admin','bookkeeping_reporting','contributions_restrictions','grant_administration','annual_compliance')),
  dimension text NOT NULL CHECK (dimension IN ('commercial','delivery')),
  action text NOT NULL CHECK (action IN ('requested','approved','withdrawn','revoked')),
  request_id uuid REFERENCES public.foundation_component_release_events(id),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 2000),
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT foundation_release_request_link CHECK ((action = 'requested') = (request_id IS NULL) OR action = 'revoked')
);
GRANT ALL ON public.foundation_component_release_events TO service_role;
ALTER TABLE public.foundation_component_release_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX foundation_release_events_idx ON public.foundation_component_release_events(component, dimension, created_at);

CREATE FUNCTION public.foundation_component_released(_component text, _dimension text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT e.action = 'approved' FROM public.foundation_component_release_events e
    WHERE e.component = _component AND e.dimension = _dimension AND e.action IN ('approved','revoked')
    ORDER BY e.created_at DESC, e.id DESC LIMIT 1), false)
$$;
REVOKE ALL ON FUNCTION public.foundation_component_released(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.foundation_component_released(text, text) TO service_role;

CREATE FUNCTION public.foundation_release_event_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE req record; k text; needed text[];
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Release history is append-only'; END IF;
  IF NEW.action = 'requested' THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = NEW.actor_id AND r.role::text IN ('admin','super_admin')) THEN
      RAISE EXCEPTION 'Only an administrator can request a release';
    END IF;
    needed := CASE NEW.dimension WHEN 'commercial' THEN ARRAY['terms','pricing_policy','verification','delivery_workflow','validation'] ELSE ARRAY['delivery_workflow','validation'] END;
    FOREACH k IN ARRAY needed LOOP
      IF length(trim(coalesce(NEW.evidence->>k, ''))) < 10 THEN RAISE EXCEPTION 'Release evidence is missing: %', k; END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM public.foundation_component_release_events o WHERE o.component = NEW.component AND o.dimension = NEW.dimension AND o.action = 'requested'
      AND NOT EXISTS (SELECT 1 FROM public.foundation_component_release_events x WHERE x.request_id = o.id AND x.action IN ('approved','withdrawn'))) THEN
      RAISE EXCEPTION 'A release request for this component is already open';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = NEW.actor_id AND r.role::text = 'super_admin') AND NEW.action <> 'withdrawn' THEN
    RAISE EXCEPTION 'Only a Super Admin can approve or revoke a release';
  END IF;
  IF NEW.action = 'revoked' THEN
    IF NOT public.foundation_component_released(NEW.component, NEW.dimension) THEN RAISE EXCEPTION 'This component is not released'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO req FROM public.foundation_component_release_events WHERE id = NEW.request_id;
  IF req.id IS NULL OR req.action <> 'requested' OR req.component <> NEW.component OR req.dimension <> NEW.dimension THEN RAISE EXCEPTION 'Release request not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.foundation_component_release_events x WHERE x.request_id = req.id AND x.action IN ('approved','withdrawn')) THEN
    RAISE EXCEPTION 'This release request was already decided';
  END IF;
  IF NEW.action = 'approved' THEN
    IF NEW.actor_id = req.actor_id THEN RAISE EXCEPTION 'Someone other than the requester must approve a release'; END IF;
    IF NEW.dimension = 'commercial' AND NOT public.foundation_component_released(NEW.component, 'delivery') THEN
      RAISE EXCEPTION 'Release delivery readiness for this component first';
    END IF;
    NEW.evidence := req.evidence;
  ELSIF NEW.action = 'withdrawn' AND NEW.actor_id <> req.actor_id AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = NEW.actor_id AND r.role::text = 'super_admin') THEN
    RAISE EXCEPTION 'Only the requester or a Super Admin can withdraw a release request';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER foundation_release_event_guard BEFORE INSERT OR UPDATE OR DELETE ON public.foundation_component_release_events
  FOR EACH ROW EXECUTE FUNCTION public.foundation_release_event_guard();

-- 6. Gates now consult the per-component release record. With no approved release (today), every block stays.
CREATE OR REPLACE FUNCTION public.foundation_unreleased_key_gate() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE comp text;
BEGIN
  IF NEW.service_key LIKE 'FOUNDATION_ADMIN:%' THEN
    comp := split_part(NEW.service_key, ':', 2);
    IF NOT public.foundation_component_released(comp, 'commercial')
       OR (TG_TABLE_NAME IN ('invoice_lines','engagement_services','client_service_selections') AND NOT public.foundation_component_released(comp, 'delivery')) THEN
      RAISE EXCEPTION 'Foundation Administration is not released yet: it cannot be contracted, enrolled or billed (%)', TG_TABLE_NAME;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.foundation_quote_all_released(_quote uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.sales_quote_lines l WHERE l.quote_id = _quote AND l.foundation_snapshot IS NOT NULL
    AND NOT public.foundation_component_released(split_part(l.service_key, ':', 2), 'commercial'))
$$;
REVOKE ALL ON FUNCTION public.foundation_quote_all_released(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.foundation_quote_all_released(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.foundation_quote_gate() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE has_f boolean; negotiated boolean;
BEGIN
  SELECT bool_or(true), bool_or(foundation_snapshot->>'priceSource' IS DISTINCT FROM 'rate_card') INTO has_f, negotiated
    FROM public.sales_quote_lines WHERE quote_id = NEW.id AND foundation_snapshot IS NOT NULL;
  IF NOT coalesce(has_f, false) THEN RETURN NEW; END IF;
  IF NEW.status IN ('sent','signed') AND NEW.status IS DISTINCT FROM OLD.status AND NOT public.foundation_quote_all_released(NEW.id) THEN
    RAISE EXCEPTION 'Foundation Administration is not released yet: this quote cannot be sent or signed';
  END IF;
  IF NEW.sow_id IS NOT NULL AND NEW.sow_id IS DISTINCT FROM OLD.sow_id AND NOT public.foundation_quote_all_released(NEW.id) THEN
    RAISE EXCEPTION 'Foundation Administration is not released yet: no SOW can be drafted from this quote';
  END IF;
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' AND (coalesce(negotiated, false) OR NEW.needs_exec_approval) THEN
    IF NEW.approved_by IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = NEW.approved_by AND r.role::text IN ('executive','cro','super_admin')) THEN
      RAISE EXCEPTION 'Negotiated Foundation Administration pricing needs executive approval';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.foundation_unreleased_sow_gate() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.generated_lines IS NOT NULL AND jsonb_typeof(NEW.generated_lines) = 'array' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.generated_lines) e
    WHERE (e->>'service_key' LIKE 'FOUNDATION_ADMIN:%' OR (e ? 'foundation_snapshot' AND e->'foundation_snapshot' <> 'null'::jsonb))
      AND NOT public.foundation_component_released(coalesce(nullif(split_part(e->>'service_key', ':', 2), ''), 'unknown'), 'commercial')
  ) THEN
    RAISE EXCEPTION 'Foundation Administration is not released yet: it cannot appear on an SOW';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.foundation_unreleased_document_gate() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.quote_id IS NOT NULL AND NEW.sent_at IS NOT NULL AND OLD.sent_at IS NULL AND NOT public.foundation_quote_all_released(NEW.quote_id) THEN
    RAISE EXCEPTION 'Foundation Administration is not released yet: proposals that include it cannot be sent';
  END IF;
  RETURN NEW;
END $$;

COMMENT ON TABLE public.foundation_submissions IS 'Client-proposed foundation facts and people requests. Never applied without a different reviewer; accepted changes are logged in foundation_profile_events.';
COMMENT ON TABLE public.foundation_verification_reviews IS 'Foundation entity-records review decisions only. AML screening and person identity stay in the canonical verification records.';
COMMENT ON TABLE public.foundation_component_release_events IS 'Per-component commercial release and delivery readiness. Feature switches never release a component; money movement is not releasable here.';