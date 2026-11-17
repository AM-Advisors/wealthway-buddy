CREATE TABLE public.foundation_exemption_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foundation_profile_id uuid NOT NULL REFERENCES public.foundation_profiles(id),
  form text CHECK (form IS NULL OR form IN ('1023','1023_ez')),
  ez_screen jsonb NOT NULL DEFAULT '{}'::jsonb,
  stage text NOT NULL DEFAULT 'eligibility' CHECK (stage IN ('eligibility','gathering','drafting','board_review','ready_to_submit','submitted','closed')),
  projections_document_id uuid REFERENCES public.foundation_documents(id),
  draft_document_id uuid REFERENCES public.foundation_documents(id),
  board_approved_on date,
  board_approver_person_id uuid,
  board_evidence_document_id uuid REFERENCES public.foundation_documents(id),
  board_note text CHECK (board_note IS NULL OR length(board_note) <= 2000),
  submitted_on date,
  submitted_by_person_id uuid,
  confirmation_ref text CHECK (confirmation_ref IS NULL OR length(trim(confirmation_ref)) BETWEEN 3 AND 120),
  outcome text CHECK (outcome IS NULL OR outcome IN ('approved','denied','withdrawn')),
  determination_document_id uuid REFERENCES public.foundation_documents(id),
  determination_letter_on date,
  exemption_effective_on date,
  closed_note text CHECK (closed_note IS NULL OR length(closed_note) <= 2000),
  closed_on date,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT foundation_exemption_closed_outcome CHECK ((stage = 'closed') = (outcome IS NOT NULL)),
  CONSTRAINT foundation_exemption_approved_letter CHECK (outcome IS DISTINCT FROM 'approved' OR (determination_document_id IS NOT NULL AND determination_letter_on IS NOT NULL)),
  CONSTRAINT foundation_exemption_submitted_facts CHECK (stage <> 'submitted' OR (submitted_on IS NOT NULL AND submitted_by_person_id IS NOT NULL AND confirmation_ref IS NOT NULL)),
  CONSTRAINT foundation_exemption_board_facts CHECK (stage NOT IN ('ready_to_submit','submitted') OR (board_approved_on IS NOT NULL AND board_approver_person_id IS NOT NULL))
);
GRANT ALL ON public.foundation_exemption_applications TO service_role;
ALTER TABLE public.foundation_exemption_applications ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX foundation_exemption_one_open ON public.foundation_exemption_applications(foundation_profile_id) WHERE stage <> 'closed';
CREATE INDEX foundation_exemption_profile_idx ON public.foundation_exemption_applications(foundation_profile_id);

CREATE FUNCTION public.foundation_exemption_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ok boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Exemption applications are retained; close it as withdrawn instead'; END IF;
  IF OLD.stage = 'closed' THEN RAISE EXCEPTION 'A closed exemption application can''t be changed'; END IF;
  IF NEW.foundation_profile_id <> OLD.foundation_profile_id OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'An exemption application stays with its foundation';
  END IF;
  IF OLD.stage = 'submitted' AND (NEW.submitted_on IS DISTINCT FROM OLD.submitted_on OR NEW.submitted_by_person_id IS DISTINCT FROM OLD.submitted_by_person_id
     OR NEW.confirmation_ref IS DISTINCT FROM OLD.confirmation_ref OR NEW.form IS DISTINCT FROM OLD.form OR NEW.draft_document_id IS DISTINCT FROM OLD.draft_document_id) THEN
    RAISE EXCEPTION 'The submitted application is a record of what was filed and can''t be changed';
  END IF;
  IF NEW.stage <> OLD.stage THEN
    ok := (OLD.stage, NEW.stage) IN (('eligibility','gathering'),('gathering','drafting'),('drafting','board_review'),('board_review','ready_to_submit'),
                                     ('board_review','drafting'),('ready_to_submit','submitted'),('submitted','closed'))
          OR (NEW.stage = 'closed' AND NEW.outcome = 'withdrawn');
    IF NOT ok THEN RAISE EXCEPTION 'That step isn''t allowed from here'; END IF;
    IF NEW.stage = 'closed' AND OLD.stage <> 'submitted' AND NEW.outcome <> 'withdrawn' THEN RAISE EXCEPTION 'Only a submitted application can receive a determination'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER foundation_exemption_guard BEFORE UPDATE OR DELETE ON public.foundation_exemption_applications
  FOR EACH ROW EXECUTE FUNCTION public.foundation_exemption_guard();

CREATE TABLE public.foundation_exemption_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.foundation_exemption_applications(id),
  actor_id uuid,
  event text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.foundation_exemption_events TO service_role;
ALTER TABLE public.foundation_exemption_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX foundation_exemption_events_app_idx ON public.foundation_exemption_events(application_id, created_at);
CREATE TRIGGER foundation_exemption_events_append_only BEFORE UPDATE OR DELETE ON public.foundation_exemption_events
  FOR EACH ROW EXECUTE FUNCTION public.block_foundation_event_mutation();

CREATE TABLE public.foundation_irs_correspondence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.foundation_exemption_applications(id),
  kind text NOT NULL CHECK (kind IN ('information_request','acknowledgment','notice')),
  received_on date NOT NULL,
  summary text NOT NULL CHECK (length(trim(summary)) BETWEEN 3 AND 2000),
  letter_document_id uuid REFERENCES public.foundation_documents(id),
  response_due_on date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','response_drafted','board_approved','responded','closed')),
  response_document_id uuid REFERENCES public.foundation_documents(id),
  approver_person_id uuid,
  approved_on date,
  responded_on date,
  sent_by_person_id uuid,
  closed_reason text CHECK (closed_reason IS NULL OR length(closed_reason) <= 1000),
  task_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT foundation_irs_drafted CHECK (status NOT IN ('response_drafted','board_approved','responded') OR response_document_id IS NOT NULL),
  CONSTRAINT foundation_irs_approved CHECK (status NOT IN ('board_approved','responded') OR (approver_person_id IS NOT NULL AND approved_on IS NOT NULL)),
  CONSTRAINT foundation_irs_responded CHECK (status <> 'responded' OR (responded_on IS NOT NULL AND sent_by_person_id IS NOT NULL)),
  CONSTRAINT foundation_irs_closed CHECK (status <> 'closed' OR length(trim(coalesce(closed_reason,''))) >= 10)
);
GRANT ALL ON public.foundation_irs_correspondence TO service_role;
ALTER TABLE public.foundation_irs_correspondence ENABLE ROW LEVEL SECURITY;
CREATE INDEX foundation_irs_correspondence_app_idx ON public.foundation_irs_correspondence(application_id, received_on);

CREATE FUNCTION public.foundation_irs_correspondence_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'IRS correspondence is retained; close it instead'; END IF;
  IF OLD.status IN ('responded','closed') THEN RAISE EXCEPTION 'This letter is finished and can''t be changed'; END IF;
  IF NEW.application_id <> OLD.application_id OR NEW.created_by <> OLD.created_by OR NEW.received_on <> OLD.received_on THEN
    RAISE EXCEPTION 'A letter stays with its application';
  END IF;
  IF NEW.status <> OLD.status AND NOT ((OLD.status, NEW.status) IN (('open','response_drafted'),('response_drafted','board_approved'),('response_drafted','open'),('board_approved','responded')) OR NEW.status = 'closed') THEN
    RAISE EXCEPTION 'That step isn''t allowed from here';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER foundation_irs_correspondence_guard BEFORE UPDATE OR DELETE ON public.foundation_irs_correspondence
  FOR EACH ROW EXECUTE FUNCTION public.foundation_irs_correspondence_guard();