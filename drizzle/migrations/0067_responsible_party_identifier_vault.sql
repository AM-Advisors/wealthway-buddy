CREATE TABLE private.offering_responsible_party_identifiers (
  offering_id uuid PRIMARY KEY REFERENCES public.offerings(id) ON DELETE RESTRICT,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  identifier_type text NOT NULL DEFAULT 'unknown' CHECK (identifier_type IN ('ssn','itin','ein','unknown')),
  last4 text CHECK (last4 IS NULL OR last4 ~ '^[0-9]{4}$'),
  stored_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.offering_responsible_party_identifiers FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.offering_responsible_party_identifiers TO service_role;
ALTER TABLE private.offering_responsible_party_identifiers ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE private.offering_responsible_party_identifiers IS 'SS-4 Responsible Party SSN/ITIN, AES-GCM encrypted with the canonical tax-ID key (same scheme as private.tax_identifiers). Service-role only.';

CREATE OR REPLACE FUNCTION public.store_offering_rp_identifier(_offering uuid, _ciphertext text, _iv text, _key_version integer, _type text, _last4 text, _actor uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = private, public AS $$
  INSERT INTO private.offering_responsible_party_identifiers (offering_id, ciphertext, iv, key_version, identifier_type, last4, stored_by)
  VALUES (_offering, _ciphertext, _iv, _key_version, _type, _last4, _actor)
  ON CONFLICT (offering_id) DO UPDATE SET ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv, key_version = EXCLUDED.key_version,
    identifier_type = EXCLUDED.identifier_type, last4 = EXCLUDED.last4, stored_by = EXCLUDED.stored_by, updated_at = now();
$$;

CREATE OR REPLACE FUNCTION public.read_offering_rp_identifier(_offering uuid)
RETURNS TABLE(ciphertext text, iv text, key_version integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = private, public AS $$
  SELECT ciphertext, iv, key_version FROM private.offering_responsible_party_identifiers WHERE offering_id = _offering;
$$;

CREATE OR REPLACE FUNCTION public.offering_rp_identifier_meta(_offering uuid)
RETURNS TABLE(on_file boolean, identifier_type text, last4 text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = private, public AS $$
  SELECT true, identifier_type, last4 FROM private.offering_responsible_party_identifiers WHERE offering_id = _offering;
$$;

-- Removes the legacy plaintext only when an encrypted copy already exists.
CREATE OR REPLACE FUNCTION public.clear_legacy_rp_plaintext(_offering uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM private.offering_responsible_party_identifiers WHERE offering_id = _offering) THEN
    RETURN false;
  END IF;
  UPDATE private.offering_entity_details
     SET ss4 = (ss4 - 'responsible_party_tin' - 'responsible_party_tin_last4')
   WHERE offering_id = _offering AND (ss4 ? 'responsible_party_tin' OR ss4 ? 'responsible_party_tin_last4');
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.list_legacy_rp_plaintext()
RETURNS TABLE(offering_id uuid, tin text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = private, public AS $$
  SELECT offering_id, ss4->>'responsible_party_tin' FROM private.offering_entity_details
   WHERE coalesce(ss4->>'responsible_party_tin','') <> '';
$$;

REVOKE ALL ON FUNCTION public.store_offering_rp_identifier(uuid,text,text,integer,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_offering_rp_identifier(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.offering_rp_identifier_meta(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_legacy_rp_plaintext(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_legacy_rp_plaintext() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_offering_rp_identifier(uuid,text,text,integer,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_offering_rp_identifier(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.offering_rp_identifier_meta(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_legacy_rp_plaintext(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_legacy_rp_plaintext() TO service_role;