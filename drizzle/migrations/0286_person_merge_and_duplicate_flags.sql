ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS merged_into_person_id uuid REFERENCES public.persons(id),
  ADD COLUMN IF NOT EXISTS merged_at timestamptz,
  ADD COLUMN IF NOT EXISTS merged_by uuid;

-- Service-role only (read through staff-checked server functions); RLS on with no client policies.
CREATE TABLE public.person_merge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kept_person_id uuid NOT NULL,
  merged_person_id uuid NOT NULL,
  rule text NOT NULL,
  moved jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.person_merge_events TO service_role;
ALTER TABLE public.person_merge_events ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_person_merge_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Person merge history is immutable'; END $$;
CREATE TRIGGER person_merge_events_immutable BEFORE UPDATE OR DELETE ON public.person_merge_events FOR EACH ROW EXECUTE FUNCTION public.block_person_merge_event_mutation();

CREATE TABLE public.person_duplicate_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_a uuid NOT NULL REFERENCES public.persons(id),
  person_b uuid NOT NULL REFERENCES public.persons(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','merged','dismissed')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_a, person_b)
);
GRANT ALL ON public.person_duplicate_flags TO service_role;
ALTER TABLE public.person_duplicate_flags ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_merged_person_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.merged_into_person_id IS NOT NULL THEN RAISE EXCEPTION 'This person was merged into another record and is read-only'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER persons_block_merged_write BEFORE UPDATE ON public.persons FOR EACH ROW EXECUTE FUNCTION public.block_merged_person_write();

CREATE OR REPLACE FUNCTION public.merge_persons(_keep uuid, _drop uuid, _actor uuid, _rule text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t text; n int; moved jsonb := '{}'::jsonb;
  tables text[] := ARRAY['account_identity_checks','client_contacts','fund_boi_parties','fund_record_sync_items','fund_setup_parties','fund_signatories','government_id_documents','individual_tax_documents','investment_profile_relationships','investment_profiles','investor_onboardings','investor_positions','kyc_verifications','person_addresses','person_kyc_requests','side_letters','tax_classification_records','tax_document_records','taxpayer_household_members','user_access_states'];
  k record; d record;
BEGIN
  IF _keep = _drop THEN RAISE EXCEPTION 'Cannot merge a person into itself'; END IF;
  SELECT * INTO k FROM persons WHERE id = _keep FOR UPDATE;
  SELECT * INTO d FROM persons WHERE id = _drop FOR UPDATE;
  IF k.id IS NULL OR d.id IS NULL THEN RAISE EXCEPTION 'Person not found'; END IF;
  IF k.merged_into_person_id IS NOT NULL OR d.merged_into_person_id IS NOT NULL THEN RAISE EXCEPTION 'Already merged'; END IF;
  IF k.user_id IS NOT NULL AND d.user_id IS NOT NULL AND k.user_id <> d.user_id THEN RAISE EXCEPTION 'Both records have different sign-in accounts; resolve manually'; END IF;
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('UPDATE public.%I SET person_id = $1 WHERE person_id = $2', t) USING _keep, _drop;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN moved := moved || jsonb_build_object(t, n); END IF;
    EXCEPTION WHEN OTHERS THEN
      moved := moved || jsonb_build_object(t, 'kept_on_old_record');
    END;
  END LOOP;
  UPDATE offerings SET fund_signatory_person_id = _keep WHERE fund_signatory_person_id = _drop;
  UPDATE offerings SET ss4_responsible_person_id = _keep WHERE ss4_responsible_person_id = _drop;
  IF k.user_id IS NULL AND d.user_id IS NOT NULL THEN
    UPDATE persons SET user_id = NULL WHERE id = _drop;
    UPDATE persons SET user_id = d.user_id WHERE id = _keep;
  END IF;
  UPDATE persons SET merged_into_person_id = _keep, merged_at = now(), merged_by = _actor WHERE id = _drop;
  UPDATE person_duplicate_flags SET status = 'merged', decided_by = _actor, decided_at = now() WHERE status = 'open' AND ((person_a = _keep AND person_b = _drop) OR (person_a = _drop AND person_b = _keep));
  INSERT INTO person_merge_events (kept_person_id, merged_person_id, rule, moved, actor_user_id) VALUES (_keep, _drop, _rule, moved, _actor);
  RETURN moved;
END $$;
REVOKE ALL ON FUNCTION public.merge_persons(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_persons(uuid, uuid, uuid, text) TO service_role;