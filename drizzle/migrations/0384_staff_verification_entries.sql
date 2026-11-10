-- Operations-entered KYC/AML details. One person enters, a different authorized reviewer decides.
CREATE TABLE public.staff_verification_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.persons(id),
  status text NOT NULL DEFAULT 'review' CHECK (status IN ('review','approved','declined','withdrawn')),
  kyc jsonb,
  aml jsonb,
  source_reference text NOT NULL,
  evidence_path text,
  evidence_name text,
  note text,
  entered_by uuid NOT NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  applied jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kyc IS NOT NULL OR aml IS NOT NULL)
);
GRANT ALL ON public.staff_verification_entries TO service_role;
ALTER TABLE public.staff_verification_entries ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX staff_verification_entries_one_open ON public.staff_verification_entries(person_id) WHERE status = 'review';
CREATE INDEX staff_verification_entries_status_idx ON public.staff_verification_entries(status, created_at DESC);

CREATE TABLE public.staff_verification_entry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.staff_verification_entries(id),
  person_id uuid NOT NULL,
  event text NOT NULL,
  from_status text,
  to_status text,
  note text,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.staff_verification_entry_events TO service_role;
ALTER TABLE public.staff_verification_entry_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX staff_verification_entry_events_entry_idx ON public.staff_verification_entry_events(entry_id, created_at);

-- Entered details never change; only an open entry may be decided or withdrawn, once.
CREATE OR REPLACE FUNCTION public.guard_staff_verification_entry()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Verification entries are retained'; END IF;
  IF OLD.status <> 'review' THEN RAISE EXCEPTION 'A decided verification entry cannot change'; END IF;
  IF NEW.person_id IS DISTINCT FROM OLD.person_id OR NEW.kyc IS DISTINCT FROM OLD.kyc OR NEW.aml IS DISTINCT FROM OLD.aml
     OR NEW.source_reference IS DISTINCT FROM OLD.source_reference OR NEW.evidence_path IS DISTINCT FROM OLD.evidence_path
     OR NEW.evidence_name IS DISTINCT FROM OLD.evidence_name OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.entered_by IS DISTINCT FROM OLD.entered_by OR NEW.entered_at IS DISTINCT FROM OLD.entered_at THEN
    RAISE EXCEPTION 'Entered verification details cannot be edited; withdraw and enter again';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER staff_verification_entry_guard BEFORE UPDATE OR DELETE ON public.staff_verification_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_staff_verification_entry();

CREATE OR REPLACE FUNCTION public.block_staff_verification_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Verification history is append-only'; END $$;
CREATE TRIGGER staff_verification_event_append_only BEFORE UPDATE OR DELETE ON public.staff_verification_entry_events
  FOR EACH ROW EXECUTE FUNCTION public.block_staff_verification_event_mutation();