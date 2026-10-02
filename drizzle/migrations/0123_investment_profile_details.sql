ALTER TABLE public.investment_profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS tax_id_type text,
  ADD COLUMN IF NOT EXISTS tax_id_last4 text;

COMMENT ON COLUMN public.entity_verifications.tax_id_reference IS 'DEPRECATED: full tax IDs live encrypted in private.investment_profile_tax_ids';

CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.investment_profile_tax_ids (
  profile_id uuid PRIMARY KEY REFERENCES public.investment_profiles(id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.investment_profile_tax_ids FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.investment_profile_tax_ids TO service_role;

CREATE TABLE public.investment_profile_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.investment_profiles(id) ON DELETE CASCADE,
  actor_id uuid,
  event text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.investment_profile_events TO service_role;
ALTER TABLE public.investment_profile_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_profile_event_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'investment_profile_events is append-only'; END $$;
CREATE TRIGGER investment_profile_events_append_only
  BEFORE UPDATE OR DELETE ON public.investment_profile_events
  FOR EACH ROW EXECUTE FUNCTION public.block_profile_event_mutation();

CREATE OR REPLACE FUNCTION public.store_profile_tax_id(_profile uuid, _ciphertext text, _iv text, _key_version int, _actor uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, private AS $$
  INSERT INTO private.investment_profile_tax_ids(profile_id, ciphertext, iv, key_version, updated_by, updated_at)
  VALUES (_profile, _ciphertext, _iv, _key_version, _actor, now())
  ON CONFLICT (profile_id) DO UPDATE SET ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv,
    key_version = EXCLUDED.key_version, updated_by = EXCLUDED.updated_by, updated_at = now();
$$;
REVOKE ALL ON FUNCTION public.store_profile_tax_id(uuid, text, text, int, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_profile_tax_id(uuid, text, text, int, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.read_profile_tax_id(_profile uuid)
RETURNS TABLE(ciphertext text, iv text) LANGUAGE sql SECURITY DEFINER SET search_path = public, private AS $$
  SELECT ciphertext, iv FROM private.investment_profile_tax_ids WHERE profile_id = _profile;
$$;
REVOKE ALL ON FUNCTION public.read_profile_tax_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_profile_tax_id(uuid) TO service_role;