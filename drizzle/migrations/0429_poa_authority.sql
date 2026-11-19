-- Power of attorney authority: the accepted document's listed powers become a
-- canonical delegation. The record keeps the document; the delegation engine
-- decides what the named person may actually do.

ALTER TABLE public.power_of_attorney_records
  ADD COLUMN IF NOT EXISTS agent_user_id uuid,
  ADD COLUMN IF NOT EXISTS delegation_id uuid,
  ADD COLUMN IF NOT EXISTS covered_document_types text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.power_of_attorney_records.agent_user_id IS 'Login account of the person the document names, matched by exact email or chosen by staff. No account means no authority.';
COMMENT ON COLUMN public.power_of_attorney_records.delegation_id IS 'Canonical delegation created when Harmonious accepted this document. Ended when the record is revoked or replaced.';
COMMENT ON COLUMN public.power_of_attorney_records.covered_document_types IS 'Document types the power of attorney names for signing. Part of the document, so fixed once saved.';

CREATE INDEX IF NOT EXISTS poa_records_agent_idx
  ON public.power_of_attorney_records (agent_user_id) WHERE agent_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS poa_records_delegation_idx
  ON public.power_of_attorney_records (delegation_id) WHERE delegation_id IS NOT NULL;

-- Covered document types belong to the signed document, so they cannot be rewritten.
CREATE OR REPLACE FUNCTION public.guard_poa_record_update() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.subject_kind IS DISTINCT FROM OLD.subject_kind OR NEW.investment_profile_id IS DISTINCT FROM OLD.investment_profile_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.agent_name IS DISTINCT FROM OLD.agent_name
     OR NEW.agent_email IS DISTINCT FROM OLD.agent_email OR NEW.poa_kind IS DISTINCT FROM OLD.poa_kind
     OR NEW.durable IS DISTINCT FROM OLD.durable OR NEW.covered_powers IS DISTINCT FROM OLD.covered_powers
     OR NEW.covered_document_types IS DISTINCT FROM OLD.covered_document_types
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

-- History records an account link, an authority grant and an authority ending.
ALTER TABLE public.power_of_attorney_events
  DROP CONSTRAINT IF EXISTS power_of_attorney_events_event_check;
ALTER TABLE public.power_of_attorney_events
  ADD CONSTRAINT power_of_attorney_events_event_check
  CHECK (event IN ('submitted','accepted','rejected','revoked','replaced','downloaded','agent_linked','authority_granted','authority_revoked'));