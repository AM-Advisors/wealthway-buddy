INSERT INTO public.compliance_requirements (framework, code, title) VALUES
 ('ISO 27001','A.5','Organizational controls (policies, roles, supplier security, incident management)'),
 ('ISO 27001','A.6','People controls (screening, awareness training, termination)'),
 ('ISO 27001','A.7','Physical controls'),
 ('ISO 27001','A.8','Technological controls (access, logging, secure development, backups)'),
 ('ISO 27001','Clause 6','Risk assessment, treatment and Statement of Applicability'),
 ('ISO 27001','Clause 9','Internal audit and management review');

INSERT INTO public.compliance_controls (control_key,name,objective,control_type,frequency,evidence_requirements,owner_label) VALUES
 ('DS-01','Data-subject requests','Handle access/deletion requests within 30 days, honoring legal holds','corrective','per_event','Request log with response date and outcome','Operations'),
 ('PO-01','Information security policy set','Approved security, acceptable use, incident, continuity, vendor and data classification policies','administrative','annually','Signed policy documents with approval date','Leadership'),
 ('HR-01','Security training and screening','Employees complete awareness training and background checks','administrative','annually','Training completion and screening records','Leadership'),
 ('PT-01','Independent penetration test','Annual third-party penetration test with tracked remediation','detective','annually','Pen test report and remediation tickets','Leadership'),
 ('AU-01','Internal audit and management review','Annual ISMS internal audit and management review','administrative','annually','Audit report and review minutes','Leadership'),
 ('MF-01','Two-step sign-in for staff','All staff accounts enrolled in two-step sign-in','preventive','continuous','Enrollment report','Operations'),
 ('CK-01','Tracking consent','Visitors consent before non-essential tracking','preventive','continuous','Consent configuration and records','Marketing');

INSERT INTO public.compliance_control_mappings (control_key, requirement_id)
SELECT m.k, r.id FROM (VALUES
 ('DS-01','GDPR','Data-subject rights'),('CK-01','GDPR','Purpose limitation'),('PO-01','SOC 2','Security'),('PO-01','ISO 27001','A.5'),
 ('HR-01','ISO 27001','A.6'),('HR-01','SOC 2','Security'),('PT-01','ISO 27001','A.8'),('PT-01','SOC 2','Security'),
 ('AU-01','ISO 27001','Clause 9'),('MF-01','ISO 27001','A.8'),('MF-01','SOC 2','Security'),('RA-01','ISO 27001','Clause 6'),
 ('AC-02','ISO 27001','A.8'),('LG-01','ISO 27001','A.8'),('IR-01','ISO 27001','A.5'),('VM-01','ISO 27001','A.5'),('AR-01','ISO 27001','A.5'),('RA-01','GDPR','DPIA')
) m(k,f,c) JOIN public.compliance_requirements r ON r.framework=m.f AND r.code=m.c;

CREATE TABLE public.privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('access','deletion','correction')),
  details text NOT NULL DEFAULT '' CHECK (length(details) <= 2000),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','in_progress','completed','declined')),
  due_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.privacy_requests TO authenticated;
GRANT ALL ON public.privacy_requests TO service_role;
ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own privacy requests readable" ON public.privacy_requests FOR SELECT TO authenticated USING (user_id = auth.uid());