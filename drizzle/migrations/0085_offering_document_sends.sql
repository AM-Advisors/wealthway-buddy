CREATE TABLE public.offering_document_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  offering_document_id uuid NOT NULL REFERENCES public.offering_documents(id),
  version integer NOT NULL,
  onboarding_id uuid NOT NULL REFERENCES public.investor_onboardings(id),
  recipient_email text,
  note text,
  email_sent boolean NOT NULL DEFAULT false,
  sent_by uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.offering_document_sends TO service_role;
ALTER TABLE public.offering_document_sends ENABLE ROW LEVEL SECURITY;
CREATE INDEX offering_document_sends_onboarding_idx ON public.offering_document_sends(onboarding_id);
CREATE INDEX offering_document_sends_offering_idx ON public.offering_document_sends(offering_id);
CREATE OR REPLACE FUNCTION public.block_document_send_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'offering_document_sends is append-only'; END $$;
CREATE TRIGGER offering_document_sends_append_only BEFORE UPDATE OR DELETE ON public.offering_document_sends
FOR EACH ROW EXECUTE FUNCTION public.block_document_send_mutation();