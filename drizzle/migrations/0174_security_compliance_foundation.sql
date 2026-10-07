ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'security_compliance_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'security_compliance_viewer';

CREATE OR REPLACE FUNCTION public.grc_block_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'This security & compliance record is append-only; add a new version instead.'; END $$;

-- Scopes
CREATE TABLE public.compliance_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.compliance_scopes TO service_role;
ALTER TABLE public.compliance_scopes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.compliance_scope_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id uuid NOT NULL REFERENCES public.compliance_scopes(id),
  item_type text NOT NULL CHECK (item_type IN ('legal_entity','business_unit','product','application','infrastructure','environment','data_store','vendor','employee_group','location','process')),
  name text NOT NULL,
  notes text NOT NULL DEFAULT '',
  in_scope boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.compliance_scope_items TO service_role;
ALTER TABLE public.compliance_scope_items ENABLE ROW LEVEL SECURITY;

-- Frameworks
CREATE TABLE public.compliance_frameworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  version text NOT NULL DEFAULT '',
  requirement_framework text,
  applicability text NOT NULL DEFAULT '',
  scope_id uuid REFERENCES public.compliance_scopes(id),
  program_status text NOT NULL DEFAULT 'not_started' CHECK (program_status IN ('not_started','planned','in_progress','active','paused')),
  assessment_start date,
  assessment_end date,
  assessor text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  sort int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.compliance_frameworks TO service_role;
ALTER TABLE public.compliance_frameworks ENABLE ROW LEVEL SECURITY;

-- Controls: versioned canonical extension
CREATE TABLE public.compliance_control_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  control_key text NOT NULL,
  version int NOT NULL,
  canonical_id text NOT NULL,
  domain text NOT NULL,
  executive_owner text NOT NULL DEFAULT '',
  nature text CHECK (nature IN ('preventive','detective','corrective')),
  automation text CHECK (automation IN ('manual','automated','hybrid')),
  systems_in_scope text[] NOT NULL DEFAULT '{}',
  data_classifications text[] NOT NULL DEFAULT '{}',
  lifecycle_status text NOT NULL DEFAULT 'not_assessed' CHECK (lifecycle_status IN ('not_assessed','gap_identified','remediation_planned','implementation_in_progress','implemented','evidence_needed','evidence_collected','internal_review','operating_effectively','exception','failed','auditor_verified')),
  audit_id uuid,
  last_tested date,
  next_test date,
  auditor_notes text NOT NULL DEFAULT '',
  internal_notes text NOT NULL DEFAULT '',
  change_reason text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (control_key, version)
);
GRANT ALL ON public.compliance_control_details TO service_role;
ALTER TABLE public.compliance_control_details ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER compliance_control_details_append_only BEFORE UPDATE OR DELETE ON public.compliance_control_details FOR EACH ROW EXECUTE FUNCTION public.grc_block_mutation();

-- Risks
CREATE TABLE public.compliance_risk_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_ref text NOT NULL,
  version int NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  affected_systems text NOT NULL DEFAULT '',
  affected_data text NOT NULL DEFAULT '',
  threat text NOT NULL DEFAULT '',
  vulnerability text NOT NULL DEFAULT '',
  inherent_likelihood int NOT NULL CHECK (inherent_likelihood BETWEEN 1 AND 5),
  inherent_impact int NOT NULL CHECK (inherent_impact BETWEEN 1 AND 5),
  residual_likelihood int CHECK (residual_likelihood BETWEEN 1 AND 5),
  residual_impact int CHECK (residual_impact BETWEEN 1 AND 5),
  residual_assessed_by uuid,
  treatment text CHECK (treatment IN ('mitigate','avoid','transfer','accept')),
  owner text NOT NULL DEFAULT '',
  target_date date,
  review_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','treating','acceptance_requested','accepted','closed')),
  control_keys text[] NOT NULL DEFAULT '{}',
  acceptance_requested_by uuid,
  accepted_by uuid,
  acceptance_reason text,
  acceptance_expires date,
  change_reason text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (risk_ref, version)
);
GRANT ALL ON public.compliance_risk_assessments TO service_role;
ALTER TABLE public.compliance_risk_assessments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER compliance_risk_assessments_append_only BEFORE UPDATE OR DELETE ON public.compliance_risk_assessments FOR EACH ROW EXECUTE FUNCTION public.grc_block_mutation();

-- Policies
CREATE TABLE public.compliance_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_ref text NOT NULL,
  version int NOT NULL,
  title text NOT NULL,
  category text NOT NULL,
  owner text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('draft','review','approved','effective','superseded','retired')),
  body text NOT NULL DEFAULT '',
  effective_date date,
  next_review date,
  control_keys text[] NOT NULL DEFAULT '{}',
  requires_acknowledgment boolean NOT NULL DEFAULT false,
  approved_by uuid,
  legacy_record_id uuid,
  change_reason text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.compliance_policy_versions TO service_role;
ALTER TABLE public.compliance_policy_versions ENABLE ROW LEVEL SECURITY;
CREATE INDEX compliance_policy_versions_ref_idx ON public.compliance_policy_versions(policy_ref, created_at);
CREATE TRIGGER compliance_policy_versions_append_only BEFORE UPDATE OR DELETE ON public.compliance_policy_versions FOR EACH ROW EXECUTE FUNCTION public.grc_block_mutation();

CREATE TABLE public.compliance_policy_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_ref text NOT NULL,
  version int NOT NULL,
  user_id uuid NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_ref, version, user_id)
);
GRANT ALL ON public.compliance_policy_acknowledgments TO service_role;
ALTER TABLE public.compliance_policy_acknowledgments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER compliance_policy_ack_append_only BEFORE UPDATE OR DELETE ON public.compliance_policy_acknowledgments FOR EACH ROW EXECUTE FUNCTION public.grc_block_mutation();

-- Evidence extensions
CREATE TABLE public.compliance_evidence_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES public.compliance_evidence(id),
  expires_on date,
  sensitivity text NOT NULL DEFAULT 'restricted' CHECK (sensitivity IN ('internal','restricted','highly_restricted')),
  systems text[] NOT NULL DEFAULT '{}',
  collection_method text NOT NULL DEFAULT 'manual' CHECK (collection_method IN ('manual','automated','system_generated')),
  control_keys text[] NOT NULL DEFAULT '{}',
  requirement_ids uuid[] NOT NULL DEFAULT '{}',
  file_sha256 text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.compliance_evidence_details TO service_role;
ALTER TABLE public.compliance_evidence_details ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER compliance_evidence_details_append_only BEFORE UPDATE OR DELETE ON public.compliance_evidence_details FOR EACH ROW EXECUTE FUNCTION public.grc_block_mutation();

CREATE TABLE public.compliance_evidence_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL,
  user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('view','download')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.compliance_evidence_access_log TO service_role;
ALTER TABLE public.compliance_evidence_access_log ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER compliance_evidence_access_append_only BEFORE UPDATE OR DELETE ON public.compliance_evidence_access_log FOR EACH ROW EXECUTE FUNCTION public.grc_block_mutation();

-- Audits / assessments
CREATE TABLE public.compliance_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_key text NOT NULL REFERENCES public.compliance_frameworks(key),
  audit_type text NOT NULL CHECK (audit_type IN ('readiness','soc2_type1','soc2_type2','iso_certification','csa_assessment','internal','penetration_test','other')),
  scope_id uuid REFERENCES public.compliance_scopes(id),
  period_start date,
  period_end date,
  assessor text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','fieldwork','completed','closed')),
  result text NOT NULL DEFAULT 'none' CHECK (result IN ('none','report_issued','certified','qualified','failed')),
  report_evidence_id uuid REFERENCES public.compliance_evidence(id),
  result_recorded_by uuid,
  result_recorded_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_result_needs_report CHECK (result IN ('none','failed') OR report_evidence_id IS NOT NULL)
);
GRANT ALL ON public.compliance_audits TO service_role;
ALTER TABLE public.compliance_audits ENABLE ROW LEVEL SECURITY;

-- Trust Center publishing
CREATE TABLE public.trust_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL CHECK (item_type IN ('assurance','section','document')),
  item_key text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  framework_key text REFERENCES public.compliance_frameworks(key),
  assurance_status text CHECK (assurance_status IN ('planned','in_preparation','assessment_in_progress','report_issued','certified')),
  audit_id uuid REFERENCES public.compliance_audits(id),
  access_level text NOT NULL DEFAULT 'internal' CHECK (access_level IN ('public','login_required','nda_required','internal')),
  state text NOT NULL DEFAULT 'internal_only' CHECK (state IN ('internal_only','approved','published','withdrawn')),
  sort int NOT NULL DEFAULT 0,
  created_by uuid,
  approved_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_type, item_key)
);
GRANT SELECT ON public.trust_publications TO anon, authenticated;
GRANT ALL ON public.trust_publications TO service_role;
ALTER TABLE public.trust_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published trust items are public" ON public.trust_publications FOR SELECT TO anon, authenticated
  USING (state = 'published' AND access_level <> 'internal');

CREATE OR REPLACE FUNCTION public.trust_publication_assurance_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.assurance_status IN ('report_issued','certified') THEN
    IF NEW.audit_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.compliance_audits a WHERE a.id = NEW.audit_id AND a.framework_key = NEW.framework_key
        AND a.report_evidence_id IS NOT NULL
        AND ((NEW.assurance_status = 'certified' AND a.result = 'certified') OR (NEW.assurance_status = 'report_issued' AND a.result IN ('report_issued','certified','qualified')))
    ) THEN
      RAISE EXCEPTION 'Report Issued / Certified needs a recorded external audit result with the report attached.';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trust_publication_assurance_guard BEFORE INSERT OR UPDATE ON public.trust_publications FOR EACH ROW EXECUTE FUNCTION public.trust_publication_assurance_guard();

CREATE TABLE public.trust_publication_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES public.trust_publications(id),
  from_state text,
  to_state text NOT NULL,
  snapshot jsonb NOT NULL,
  reason text NOT NULL DEFAULT '',
  actor uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.trust_publication_events TO service_role;
ALTER TABLE public.trust_publication_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trust_publication_events_append_only BEFORE UPDATE OR DELETE ON public.trust_publication_events FOR EACH ROW EXECUTE FUNCTION public.grc_block_mutation();

CREATE TABLE public.trust_document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES public.trust_publications(id),
  requester_name text NOT NULL CHECK (char_length(requester_name) BETWEEN 1 AND 120),
  requester_email text NOT NULL CHECK (char_length(requester_email) BETWEEN 3 AND 200),
  company text NOT NULL DEFAULT '' CHECK (char_length(company) <= 160),
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 1000),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','approved','declined','fulfilled')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.trust_document_requests TO anon, authenticated;
GRANT ALL ON public.trust_document_requests TO service_role;
ALTER TABLE public.trust_document_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone may request a published trust document" ON public.trust_document_requests FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'received' AND decided_by IS NULL AND EXISTS (SELECT 1 FROM public.trust_publications p WHERE p.id = publication_id AND p.item_type = 'document' AND p.state = 'published' AND p.access_level <> 'internal'));

-- Permanent audit log
CREATE TABLE public.compliance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor uuid NOT NULL,
  action text NOT NULL,
  record_type text NOT NULL,
  record_id text NOT NULL,
  before jsonb,
  after jsonb,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.compliance_audit_log TO service_role;
ALTER TABLE public.compliance_audit_log ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER compliance_audit_log_append_only BEFORE UPDATE OR DELETE ON public.compliance_audit_log FOR EACH ROW EXECUTE FUNCTION public.grc_block_mutation();

-- Seeds and backfills (link-only; no existing record is changed)
INSERT INTO public.compliance_scopes (name, description) VALUES ('Harmonious Production Platform', 'Starter scope. Harmonious defines which entities, systems, vendors and processes are in scope.');

INSERT INTO public.compliance_frameworks (key, name, version, requirement_framework, applicability, sort, scope_id) SELECT k, n, v, rf, a, s, (SELECT id FROM public.compliance_scopes WHERE name = 'Harmonious Production Platform') FROM (VALUES
  ('soc2', 'SOC 2', '2017 TSC (rev. 2022)', 'SOC 2', 'Trust Services Criteria for the production platform.', 1),
  ('iso27001', 'ISO/IEC 27001', '2022', 'ISO 27001', 'Information security management system backbone.', 2),
  ('iso27701', 'ISO/IEC 27701', '2025', NULL, 'Privacy information management system.', 3),
  ('csa_ccm', 'CSA Cloud Controls Matrix / STAR', 'CCM v4.1', 'CSA CCM v4', 'Cloud-security assessment layer (CAIQ self-assessment).', 4),
  ('nist_csf', 'NIST Cybersecurity Framework', '2.0', 'NIST CSF', 'Executive lens: Govern, Identify, Protect, Detect, Respond, Recover.', 5),
  ('gdpr', 'GDPR', 'Regulation (EU) 2016/679', 'GDPR', 'Privacy obligations tracked as named responsibilities.', 6)
) AS f(k, n, v, rf, a, s);

INSERT INTO public.compliance_requirements (framework, code, title) VALUES
  ('NIST CSF', 'GV', 'Govern'), ('NIST CSF', 'ID', 'Identify'), ('NIST CSF', 'PR', 'Protect'),
  ('NIST CSF', 'DE', 'Detect'), ('NIST CSF', 'RS', 'Respond'), ('NIST CSF', 'RC', 'Recover')
ON CONFLICT (framework, code) DO NOTHING;

INSERT INTO public.compliance_control_details (control_key, version, canonical_id, domain, lifecycle_status, change_reason)
SELECT c.key, 1, c.canonical, c.domain,
  CASE (SELECT e.status FROM public.compliance_control_status_events e WHERE e.control_key = c.key ORDER BY e.created_at DESC LIMIT 1)
    WHEN 'designed' THEN 'remediation_planned' WHEN 'implemented' THEN 'implemented' WHEN 'operating' THEN 'operating_effectively'
    WHEN 'tested' THEN 'internal_review' WHEN 'exception' THEN 'exception' WHEN 'remediation' THEN 'implementation_in_progress'
    ELSE 'not_assessed' END,
  'Canonical ID assigned; status carried over from existing control status'
FROM (VALUES
  ('AC-01','HCA-IAM-001','IAM'),('AC-02','HCA-IAM-002','IAM'),('AC-03','HCA-IAM-003','IAM'),('AC-04','HCA-IAM-004','IAM'),
  ('AC-05','HCA-IAM-005','IAM'),('AC-06','HCA-IAM-006','IAM'),('AC-07','HCA-IAM-007','IAM'),('AR-01','HCA-IAM-008','IAM'),
  ('MF-01','HCA-IAM-009','IAM'),('LG-01','HCA-LOG-001','LOG'),('AU-01','HCA-LOG-002','LOG'),('PR-01','HCA-DSP-001','DSP'),
  ('DI-01','HCA-DSP-002','DSP'),('DS-01','HCA-DSP-003','DSP'),('RT-01','HCA-DSP-004','DSP'),('CK-01','HCA-PRV-001','PRV'),
  ('PO-01','HCA-GRC-001','GRC'),('RA-01','HCA-GRC-002','GRC'),('HR-01','HCA-HRS-001','HRS'),('IR-01','HCA-SEF-001','SEF'),
  ('PT-01','HCA-TVM-001','TVM'),('VM-01','HCA-STA-001','STA')
) AS c(key, canonical, domain)
WHERE EXISTS (SELECT 1 FROM public.compliance_controls x WHERE x.control_key = c.key);

INSERT INTO public.compliance_policy_versions (policy_ref, version, title, category, owner, status, body, next_review, legacy_record_id, change_reason, created_by)
SELECT DISTINCT ON (r.record_ref) r.record_ref, 1, r.title, COALESCE(NULLIF(r.data->>'category',''), r.title), COALESCE(r.data->>'owner',''),
  CASE r.status WHEN 'approved' THEN 'approved' WHEN 'in_review' THEN 'review' WHEN 'retired' THEN 'retired' ELSE 'draft' END,
  COALESCE(r.data->>'text',''), NULLIF(r.data->>'next_review','')::date, r.id, 'Carried over from Compliance & Controls policy register', r.created_by
FROM public.compliance_records r WHERE r.kind = 'policy' ORDER BY r.record_ref, r.version DESC;

INSERT INTO public.trust_publications (item_type, item_key, title, framework_key, assurance_status, access_level, state, sort)
SELECT 'assurance', f.key, f.name, f.key, 'planned', 'public', 'internal_only', f.sort FROM public.compliance_frameworks f;