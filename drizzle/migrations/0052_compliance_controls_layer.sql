-- Stage 2.7 Compliance & Controls. Server-only (service_role) tables; every row append-only.
CREATE TABLE public.compliance_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  control_key text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  name text NOT NULL,
  objective text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  control_type text NOT NULL CHECK (control_type IN ('preventive','detective','corrective','administrative','technical')),
  system_process text NOT NULL DEFAULT '',
  owner_label text NOT NULL DEFAULT '',
  operator_user_id uuid,
  reviewer_user_id uuid,
  frequency text NOT NULL CHECK (frequency IN ('continuous','per_event','daily','weekly','monthly','quarterly','annually','on_change')),
  evidence_requirements text NOT NULL DEFAULT '',
  implementation text NOT NULL DEFAULT '',
  sod_required boolean NOT NULL DEFAULT true,
  effective_at timestamptz NOT NULL DEFAULT now(),
  change_reason text NOT NULL DEFAULT 'Initial version',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (control_key, version)
);
CREATE TABLE public.compliance_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework text NOT NULL,
  code text NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (framework, code)
);
CREATE TABLE public.compliance_control_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  control_key text NOT NULL,
  requirement_id uuid NOT NULL REFERENCES public.compliance_requirements(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (control_key, requirement_id)
);
CREATE TABLE public.compliance_control_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  control_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('designed','implemented','operating','tested','exception','remediation')),
  evidence_id uuid,
  note text NOT NULL DEFAULT '',
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.compliance_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  control_key text NOT NULL,
  evidence_type text NOT NULL,
  source text NOT NULL,
  period_start date,
  period_end date,
  collected_at timestamptz NOT NULL DEFAULT now(),
  collected_by uuid,
  system_generated boolean NOT NULL DEFAULT false,
  artifact_reference text,
  fingerprint text,
  record_count integer,
  query_version text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  supersedes_id uuid REFERENCES public.compliance_evidence(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.compliance_evidence_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES public.compliance_evidence(id),
  reviewer_user_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('accepted','exception')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.compliance_access_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  population text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  reviewer_user_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  fingerprint text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.compliance_access_review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.compliance_access_reviews(id),
  item_key text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approve','revoke','reduce','investigate','complete')),
  note text NOT NULL DEFAULT '',
  reviewer_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Generic versioned registers: data map, processing, retention, rights requests, DPIAs, transfers,
-- vendors, risks, incidents, exceptions, joiner/mover/leaver, privacy reviews.
CREATE TABLE public.compliance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  record_ref text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  supersedes_id uuid REFERENCES public.compliance_records(id),
  title text NOT NULL,
  status text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_reason text NOT NULL DEFAULT 'Created',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, record_ref, version)
);
CREATE INDEX ON public.compliance_records (kind, record_ref);
CREATE INDEX ON public.compliance_evidence (control_key);

GRANT ALL ON public.compliance_controls, public.compliance_requirements, public.compliance_control_mappings,
  public.compliance_control_status_events, public.compliance_evidence, public.compliance_evidence_reviews,
  public.compliance_access_reviews, public.compliance_access_review_decisions, public.compliance_records TO service_role;

ALTER TABLE public.compliance_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_control_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_control_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_evidence_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_access_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_access_review_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_records ENABLE ROW LEVEL SECURITY;
-- No policies: browsers never read these directly; server checks canonical administration.* permissions.

CREATE OR REPLACE FUNCTION public.block_compliance_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Compliance records are append-only; add a new version instead.';
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['compliance_controls','compliance_requirements','compliance_control_mappings','compliance_control_status_events','compliance_evidence','compliance_evidence_reviews','compliance_access_reviews','compliance_access_review_decisions','compliance_records'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.block_compliance_mutation()', t || '_append_only', t);
  END LOOP;
END $$;