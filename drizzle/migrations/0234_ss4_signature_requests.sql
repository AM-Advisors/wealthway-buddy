CREATE TABLE public.ss4_signature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  signer_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','signed','cancelled')),
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  signer_name text,
  signer_title text,
  signed_at timestamptz,
  signed_user_agent text,
  signed_pdf_path text,
  cancelled_at timestamptz,
  cancelled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ss4_signature_requests_offering_idx ON public.ss4_signature_requests(offering_id, created_at DESC);
CREATE INDEX ss4_signature_requests_signer_idx ON public.ss4_signature_requests(signer_user_id, status);
GRANT SELECT ON public.ss4_signature_requests TO authenticated;
GRANT ALL ON public.ss4_signature_requests TO service_role;
ALTER TABLE public.ss4_signature_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signer reads own SS-4 requests" ON public.ss4_signature_requests FOR SELECT TO authenticated USING (signer_user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.block_ss4_request_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'SS-4 signature requests cannot be deleted'; END IF;
  IF OLD.status <> 'requested' THEN RAISE EXCEPTION 'A signed or cancelled SS-4 request cannot be changed'; END IF;
  IF NEW.offering_id <> OLD.offering_id OR NEW.requested_by <> OLD.requested_by OR NEW.signer_user_id <> OLD.signer_user_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'SS-4 request identity cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ss4_signature_requests_guard BEFORE UPDATE OR DELETE ON public.ss4_signature_requests FOR EACH ROW EXECUTE FUNCTION public.block_ss4_request_rewrite();