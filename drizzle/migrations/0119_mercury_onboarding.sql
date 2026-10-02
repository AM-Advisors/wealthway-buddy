ALTER TABLE public.offering_bank_setup_requests
  ADD COLUMN IF NOT EXISTS provider_ref text,
  ADD COLUMN IF NOT EXISTS signup_link text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS submitted_payload_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS offering_bank_setup_requests_provider_ref_idx
  ON public.offering_bank_setup_requests(provider_ref) WHERE provider_ref IS NOT NULL;

CREATE TABLE public.bank_application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.offering_bank_setup_requests(id) ON DELETE CASCADE,
  status text NOT NULL,
  source text NOT NULL CHECK (source IN ('harmonious','mercury')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bank_application_events TO service_role;
ALTER TABLE public.bank_application_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_bank_application_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'bank_application_events is append-only'; END $$;
CREATE TRIGGER bank_application_events_append_only
  BEFORE UPDATE OR DELETE ON public.bank_application_events
  FOR EACH ROW EXECUTE FUNCTION public.block_bank_application_event_mutation();