CREATE OR REPLACE FUNCTION public.normalize_signer_email()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.signer_email IS NOT NULL THEN
    NEW.signer_email := lower(btrim(NEW.signer_email));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS normalize_signer_email_trg ON public.document_signature_signers;
CREATE TRIGGER normalize_signer_email_trg
BEFORE INSERT OR UPDATE OF signer_email ON public.document_signature_signers
FOR EACH ROW EXECUTE FUNCTION public.normalize_signer_email();

DROP INDEX IF EXISTS public.document_signature_signers_unique_idx;
ALTER TABLE public.document_signature_signers
  ADD CONSTRAINT document_signature_signers_signature_email_key UNIQUE (signature_id, signer_email);