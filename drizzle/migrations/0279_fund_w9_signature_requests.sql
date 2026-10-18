CREATE TABLE public.fund_w9_signature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  signer_user_id uuid NOT NULL,
  source_ref text,
  snapshot jsonb NOT NULL,
  preview_path text NOT NULL,
  preview_sha256 text NOT NULL,
  signed_path text,
  signed_sha256 text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed','cancelled')),
  signed_name text,
  signature_method text,
  signed_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_w9_signature_requests TO service_role;
ALTER TABLE public.fund_w9_signature_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX fund_w9_requests_fund_idx ON public.fund_w9_signature_requests(offering_id, created_at DESC);
CREATE UNIQUE INDEX fund_w9_requests_open_idx ON public.fund_w9_signature_requests(offering_id) WHERE status = 'pending';
CREATE OR REPLACE FUNCTION public.protect_fund_w9_request() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'W-9 signature history cannot be deleted'; END IF;
 IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'Completed W-9 requests are immutable'; END IF;
 IF NEW.offering_id IS DISTINCT FROM OLD.offering_id OR NEW.signer_user_id IS DISTINCT FROM OLD.signer_user_id OR NEW.source_ref IS DISTINCT FROM OLD.source_ref OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.preview_path IS DISTINCT FROM OLD.preview_path OR NEW.preview_sha256 IS DISTINCT FROM OLD.preview_sha256 OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'W-9 request facts are immutable; prepare a new version'; END IF;
 IF NEW.status = 'signed' AND (NEW.signed_path IS NULL OR NEW.signed_sha256 IS NULL OR NEW.signed_at IS NULL OR NEW.signed_name IS NULL OR NEW.signature_method IS NULL) THEN RAISE EXCEPTION 'W-9 signature evidence is required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_fund_w9_request BEFORE UPDATE OR DELETE ON public.fund_w9_signature_requests FOR EACH ROW EXECUTE FUNCTION public.protect_fund_w9_request();
CREATE OR REPLACE FUNCTION public.protect_fund_w9_source() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.fund_w9_signature_requests WHERE source_ref = TG_TABLE_NAME || ':' || OLD.id::text AND status <> 'cancelled') THEN
   IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A W-9 signature source cannot be deleted'; END IF;
   IF NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN RAISE EXCEPTION 'A W-9 signature source cannot be replaced'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER protect_fund_w9_tax_source BEFORE UPDATE OR DELETE ON public.fund_tax_documents FOR EACH ROW EXECUTE FUNCTION public.protect_fund_w9_source();
CREATE TRIGGER protect_fund_w9_file_source BEFORE UPDATE OR DELETE ON public.fund_files FOR EACH ROW EXECUTE FUNCTION public.protect_fund_w9_source();
CREATE TRIGGER protect_fund_w9_setup_source BEFORE UPDATE OR DELETE ON public.fund_setup_documents FOR EACH ROW EXECUTE FUNCTION public.protect_fund_w9_source();