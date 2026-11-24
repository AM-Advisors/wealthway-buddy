CREATE TABLE IF NOT EXISTS private.person_tax_ids (
  person_id uuid PRIMARY KEY,
  ciphertext text NOT NULL, iv text NOT NULL, key_version integer NOT NULL DEFAULT 1,
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.person_tax_ids FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.person_tax_ids TO service_role;

CREATE OR REPLACE FUNCTION public.store_person_tax_id(_person uuid, _ciphertext text, _iv text, _key_version integer, _actor uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','private' AS $$
  INSERT INTO private.person_tax_ids(person_id, ciphertext, iv, key_version, updated_by, updated_at)
  VALUES (_person, _ciphertext, _iv, _key_version, _actor, now())
  ON CONFLICT (person_id) DO UPDATE SET ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv,
    key_version = EXCLUDED.key_version, updated_by = EXCLUDED.updated_by, updated_at = now();
$$;
CREATE OR REPLACE FUNCTION public.read_person_tax_id(_person uuid)
RETURNS TABLE(ciphertext text, iv text) LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','private' AS $$
  SELECT ciphertext, iv FROM private.person_tax_ids WHERE person_id = _person;
$$;
REVOKE ALL ON FUNCTION public.store_person_tax_id(uuid,text,text,integer,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_person_tax_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_person_tax_id(uuid,text,text,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_person_tax_id(uuid) TO service_role;

ALTER TABLE public.investment_profile_relationships ADD COLUMN IF NOT EXISTS is_tax_form_signer boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS ipr_one_tax_form_signer ON public.investment_profile_relationships(profile_id) WHERE is_tax_form_signer AND status <> 'removed';