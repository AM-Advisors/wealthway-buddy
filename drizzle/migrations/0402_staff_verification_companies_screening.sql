ALTER TABLE public.staff_verification_entries
  ADD COLUMN subject_kind text NOT NULL DEFAULT 'person' CHECK (subject_kind IN ('person','company')),
  ADD COLUMN profile_id uuid REFERENCES public.investment_profiles(id),
  ADD COLUMN details jsonb,
  ADD COLUMN kyb jsonb,
  ADD COLUMN screening jsonb,
  ADD COLUMN sensitive jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN batch_id uuid;

ALTER TABLE public.staff_verification_entries DROP CONSTRAINT staff_verification_entries_check;
ALTER TABLE public.staff_verification_entries ADD CONSTRAINT staff_verification_entries_content
  CHECK (kyc IS NOT NULL OR aml IS NOT NULL OR kyb IS NOT NULL OR screening IS NOT NULL);
ALTER TABLE public.staff_verification_entries ADD CONSTRAINT staff_verification_entries_subject
  CHECK ((subject_kind = 'person' AND profile_id IS NULL AND kyb IS NULL)
      OR (subject_kind = 'company' AND profile_id IS NOT NULL AND kyc IS NULL));

DROP INDEX IF EXISTS public.staff_verification_entries_one_open;
CREATE UNIQUE INDEX staff_verification_entries_one_open_person ON public.staff_verification_entries(person_id)
  WHERE status = 'review' AND subject_kind = 'person';
CREATE UNIQUE INDEX staff_verification_entries_one_open_company ON public.staff_verification_entries(profile_id)
  WHERE status = 'review' AND subject_kind = 'company';
CREATE INDEX staff_verification_entries_batch_idx ON public.staff_verification_entries(batch_id) WHERE batch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_staff_verification_entry()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Verification entries are retained'; END IF;
  IF OLD.status <> 'review' THEN RAISE EXCEPTION 'A decided verification entry cannot change'; END IF;
  IF NEW.person_id IS DISTINCT FROM OLD.person_id OR NEW.kyc IS DISTINCT FROM OLD.kyc OR NEW.aml IS DISTINCT FROM OLD.aml
     OR NEW.source_reference IS DISTINCT FROM OLD.source_reference OR NEW.evidence_path IS DISTINCT FROM OLD.evidence_path
     OR NEW.evidence_name IS DISTINCT FROM OLD.evidence_name OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.entered_by IS DISTINCT FROM OLD.entered_by OR NEW.entered_at IS DISTINCT FROM OLD.entered_at
     OR NEW.subject_kind IS DISTINCT FROM OLD.subject_kind OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
     OR NEW.details IS DISTINCT FROM OLD.details OR NEW.kyb IS DISTINCT FROM OLD.kyb
     OR NEW.screening IS DISTINCT FROM OLD.screening OR NEW.sensitive IS DISTINCT FROM OLD.sensitive
     OR NEW.batch_id IS DISTINCT FROM OLD.batch_id THEN
    RAISE EXCEPTION 'Entered verification details cannot be edited; withdraw and enter again';
  END IF;
  RETURN NEW;
END $$;

CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE private.staff_verification_secrets (
  entry_id uuid NOT NULL REFERENCES public.staff_verification_entries(id),
  kind text NOT NULL CHECK (kind IN ('id_number','ssn','ein')),
  ciphertext text NOT NULL,
  iv text NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, kind)
);
REVOKE ALL ON private.staff_verification_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.staff_verification_secrets TO service_role;

CREATE OR REPLACE FUNCTION private.block_staff_verification_secret_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = private AS $$
BEGIN RAISE EXCEPTION 'Stored verification numbers cannot be changed or removed'; END $$;
CREATE TRIGGER staff_verification_secrets_append_only BEFORE UPDATE OR DELETE ON private.staff_verification_secrets
  FOR EACH ROW EXECUTE FUNCTION private.block_staff_verification_secret_mutation();

CREATE OR REPLACE FUNCTION public.store_staff_verification_secret(_entry uuid, _kind text, _ciphertext text, _iv text, _key_version int, _actor uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, private AS $$
  INSERT INTO private.staff_verification_secrets(entry_id, kind, ciphertext, iv, key_version, created_by)
  VALUES (_entry, _kind, _ciphertext, _iv, _key_version, _actor);
$$;
REVOKE ALL ON FUNCTION public.store_staff_verification_secret(uuid, text, text, text, int, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_staff_verification_secret(uuid, text, text, text, int, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.read_staff_verification_secret(_entry uuid, _kind text)
RETURNS TABLE(ciphertext text, iv text) LANGUAGE sql SECURITY DEFINER SET search_path = public, private AS $$
  SELECT ciphertext, iv FROM private.staff_verification_secrets WHERE entry_id = _entry AND kind = _kind;
$$;
REVOKE ALL ON FUNCTION public.read_staff_verification_secret(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_staff_verification_secret(uuid, text) TO service_role;