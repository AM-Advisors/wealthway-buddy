-- One authoritative, versioned address record shared across the platform.
-- Google finds and normalises an address; only documentary evidence proves
-- somebody is connected to it; Harmonious decides the compliance state.

ALTER TABLE public.person_addresses
  ALTER COLUMN person_id DROP NOT NULL;

ALTER TABLE public.person_addresses
  ADD COLUMN IF NOT EXISTS owner_type text NOT NULL DEFAULT 'person',
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS supersedes_id uuid REFERENCES public.person_addresses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS record_status text NOT NULL DEFAULT 'effective',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user_entered',
  ADD COLUMN IF NOT EXISTS place_id text,
  ADD COLUMN IF NOT EXISTS provider_verdict text,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS comparison jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS review_reason text;

UPDATE public.person_addresses
   SET owner_id = person_id
 WHERE owner_id IS NULL AND person_id IS NOT NULL;

ALTER TABLE public.person_addresses
  DROP CONSTRAINT IF EXISTS person_addresses_owner_present;
ALTER TABLE public.person_addresses
  ADD CONSTRAINT person_addresses_owner_present CHECK (owner_id IS NOT NULL OR person_id IS NOT NULL);

ALTER TABLE public.person_addresses
  DROP CONSTRAINT IF EXISTS person_addresses_record_status_check;
ALTER TABLE public.person_addresses
  ADD CONSTRAINT person_addresses_record_status_check
  CHECK (record_status IN ('pending','effective','superseded'));

CREATE INDEX IF NOT EXISTS person_addresses_owner_idx
  ON public.person_addresses (owner_type, owner_id, address_kind, record_status);

COMMENT ON COLUMN public.person_addresses.source IS
  'Provenance of this address version. A lower-authority source never overwrites a higher-authority one.';

-- Historical pinning: a transaction keeps the address version it was made with.
CREATE TABLE IF NOT EXISTS public.address_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address_id uuid NOT NULL REFERENCES public.person_addresses(id) ON DELETE RESTRICT,
  context text NOT NULL,
  context_id uuid,
  owner_type text NOT NULL DEFAULT 'person',
  owner_id uuid,
  recorded_by uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS address_usages_context_idx
  ON public.address_usages (context, context_id);
CREATE INDEX IF NOT EXISTS address_usages_address_idx
  ON public.address_usages (address_id);

COMMENT ON TABLE public.address_usages IS
  'Immutable pin of the exact address version used by a KYC, investment, tax, banking or legal event.';

GRANT SELECT ON public.address_usages TO authenticated;
GRANT ALL ON public.address_usages TO service_role;
ALTER TABLE public.address_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read address usages" ON public.address_usages
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

CREATE POLICY "people read their own address usages" ON public.address_usages
  FOR SELECT TO authenticated USING (
    owner_type = 'person' AND EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = address_usages.owner_id AND p.user_id = auth.uid()
    )
  );

-- An address version that a historical event points at can never be deleted.
CREATE OR REPLACE FUNCTION public.protect_pinned_address()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.address_usages u WHERE u.address_id = OLD.id) THEN
    RAISE EXCEPTION 'Address version % is referenced by a historical record and cannot be removed', OLD.id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS protect_pinned_address ON public.person_addresses;
CREATE TRIGGER protect_pinned_address
  BEFORE DELETE ON public.person_addresses
  FOR EACH ROW EXECUTE FUNCTION public.protect_pinned_address();