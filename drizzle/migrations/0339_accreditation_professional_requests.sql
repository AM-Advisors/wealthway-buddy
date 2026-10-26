CREATE TABLE public.accreditation_professional_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL,
  onboarding_id uuid,
  requested_by uuid NOT NULL,
  professional_name text NOT NULL,
  professional_firm text,
  professional_role text NOT NULL CHECK (professional_role IN ('cpa','attorney','investment_adviser','broker_dealer')),
  professional_email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','uploaded','expired','canceled')),
  expires_at timestamptz NOT NULL,
  send_count integer NOT NULL DEFAULT 1,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  uploaded_document_id uuid,
  uploaded_at timestamptz,
  license_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX accreditation_professional_requests_app_idx ON public.accreditation_professional_requests(application_id);
GRANT SELECT ON public.accreditation_professional_requests TO authenticated;
GRANT ALL ON public.accreditation_professional_requests TO service_role;
ALTER TABLE public.accreditation_professional_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Investors read own professional requests" ON public.accreditation_professional_requests FOR SELECT TO authenticated USING (requested_by = auth.uid());

CREATE TABLE public.accreditation_professional_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.accreditation_professional_requests(id),
  event text NOT NULL,
  actor_user_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.accreditation_professional_request_events TO service_role;
ALTER TABLE public.accreditation_professional_request_events ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_accreditation_request_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Accreditation request history is append-only'; END $$;
CREATE TRIGGER accreditation_request_events_append_only BEFORE UPDATE OR DELETE ON public.accreditation_professional_request_events
FOR EACH ROW EXECUTE FUNCTION public.block_accreditation_request_event_mutation();