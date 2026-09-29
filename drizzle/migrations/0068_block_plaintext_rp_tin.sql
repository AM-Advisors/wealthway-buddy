CREATE OR REPLACE FUNCTION private.strip_plaintext_rp_tin()
RETURNS trigger LANGUAGE plpgsql SET search_path = private, public AS $$
BEGIN
  IF NEW.ss4 IS NOT NULL AND (NEW.ss4 ? 'responsible_party_tin' OR NEW.ss4 ? 'responsible_party_tin_last4') THEN
    IF coalesce(NEW.ss4->>'responsible_party_tin','') <> '' THEN
      RAISE EXCEPTION 'Responsible party identifiers must be stored in secure tax-ID storage';
    END IF;
    NEW.ss4 := NEW.ss4 - 'responsible_party_tin' - 'responsible_party_tin_last4';
  END IF;
  RETURN NEW;
END $$;

UPDATE private.offering_entity_details
   SET ss4 = ss4 - 'responsible_party_tin' - 'responsible_party_tin_last4'
 WHERE (ss4 ? 'responsible_party_tin' OR ss4 ? 'responsible_party_tin_last4')
   AND coalesce(ss4->>'responsible_party_tin','') = '';

CREATE TRIGGER offering_entity_details_no_plaintext_rp_tin
BEFORE INSERT OR UPDATE ON private.offering_entity_details
FOR EACH ROW EXECUTE FUNCTION private.strip_plaintext_rp_tin();