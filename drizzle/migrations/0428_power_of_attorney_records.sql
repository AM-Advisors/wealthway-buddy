CREATE TABLE public.power_of_attorney_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind text NOT NULL CHECK (subject_kind IN ('investment_profile','client')),
  investment_profile_id uuid REFERENCES public.investment_profiles(id),
  client_id uuid REFERENCES public.clients(id),
  agent_name text NOT NULL CHECK (char_length(agent_name) BETWEEN 1 AND 200),
  agent_email text CHECK (agent_email IS NULL OR char_length(agent_email) <= 320),
  agent_relationship text CHECK (agent_relationship IS NULL OR char_length(agent_relationship) <= 80),
  poa_kind text NOT NULL CHECK (poa_kind IN ('general','limited')),
  durable boolean NOT NULL DEFAULT false,
  covered_powers text[] NOT NULL DEFAULT '{}',
  limits_note text CHECK (limits_note IS NULL OR char_length(limits_note) <= 1000),
  effective_on date NOT NULL,
  expires_on date,
  file_name text NOT NULL CHECK (char_length(file_name) <= 200),
  storage_path text NOT NULL CHECK (char_length(storage_path) <= 600),
  document_hash text,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','accepted','rejected','revoked')),
  submitted_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 1000),
  revoked_by uuid,
  revoked_at timestamptz,
  revoke_reason text CHECK (revoke_reason IS NULL OR char_length(revoke_reason) <= 1000),
  replaces_id uuid REFERENCES public.power_of_attorney_records(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT poa_one_subject CHECK (
    (subject_kind = 'investment_profile' AND investment_profile_id IS NOT NULL AND client_id IS NULL)
    OR (subject_kind = 'client' AND client_id IS NOT NULL AND investment_profile_id IS NULL)),
  CONSTRAINT poa_dates CHECK (expires_on IS NULL OR expires_on >= effective_on),
  CONSTRAINT poa_reviewer_not_submitter CHECK (reviewed_by IS NULL OR reviewed_by <> submitted_by)
);
GRANT ALL ON public.power_of_attorney_records TO service_role;
ALTER TABLE public.power_of_attorney_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX poa_records_profile_idx ON public.power_of_attorney_records (investment_profile_id) WHERE investment_profile_id IS NOT NULL;
CREATE INDEX poa_records_client_idx ON public.power_of_attorney_records (client_id) WHERE client_id IS NOT NULL;

-- Identity, file and dates are fixed once saved; only review/revoke fields change.
CREATE OR REPLACE FUNCTION public.guard_poa_record_update() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.subject_kind IS DISTINCT FROM OLD.subject_kind OR NEW.investment_profile_id IS DISTINCT FROM OLD.investment_profile_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.agent_name IS DISTINCT FROM OLD.agent_name
     OR NEW.agent_email IS DISTINCT FROM OLD.agent_email OR NEW.poa_kind IS DISTINCT FROM OLD.poa_kind
     OR NEW.durable IS DISTINCT FROM OLD.durable OR NEW.covered_powers IS DISTINCT FROM OLD.covered_powers
     OR NEW.effective_on IS DISTINCT FROM OLD.effective_on OR NEW.expires_on IS DISTINCT FROM OLD.expires_on
     OR NEW.storage_path IS DISTINCT FROM OLD.storage_path OR NEW.document_hash IS DISTINCT FROM OLD.document_hash
     OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Power of attorney details cannot be rewritten; upload a replacement instead.';
  END IF;
  IF OLD.status = 'revoked' OR OLD.status = 'rejected' THEN
    RAISE EXCEPTION 'A revoked or rejected power of attorney cannot change.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER poa_record_guard BEFORE UPDATE ON public.power_of_attorney_records FOR EACH ROW EXECUTE FUNCTION public.guard_poa_record_update();

CREATE OR REPLACE FUNCTION public.block_poa_record_delete() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Power of attorney records are kept; revoke instead of deleting.'; END $$;
CREATE TRIGGER poa_record_no_delete BEFORE DELETE ON public.power_of_attorney_records FOR EACH ROW EXECUTE FUNCTION public.block_poa_record_delete();

CREATE TABLE public.power_of_attorney_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.power_of_attorney_records(id),
  event text NOT NULL CHECK (event IN ('submitted','accepted','rejected','revoked','replaced','downloaded')),
  actor_user_id uuid NOT NULL,
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.power_of_attorney_events TO service_role;
ALTER TABLE public.power_of_attorney_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX poa_events_record_idx ON public.power_of_attorney_events (record_id, created_at);

CREATE OR REPLACE FUNCTION public.block_poa_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Power of attorney history cannot be changed.'; END $$;
CREATE TRIGGER poa_events_append_only BEFORE UPDATE OR DELETE ON public.power_of_attorney_events FOR EACH ROW EXECUTE FUNCTION public.block_poa_event_mutation();