CREATE TABLE public.fund_close_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  client_id uuid,
  requested_by uuid NOT NULL,
  target_date date,
  notes text,
  onboarding_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','in_review','completed','returned')),
  staff_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_close_requests TO service_role;
ALTER TABLE public.fund_close_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.fund_close_requests(offering_id);
COMMENT ON TABLE public.fund_close_requests IS 'Manager-submitted, staff-reviewed close requests; read/written only via server functions after authorization.';

CREATE TABLE public.fund_close_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  close_request_id uuid NOT NULL REFERENCES public.fund_close_requests(id) ON DELETE CASCADE,
  actor_id uuid,
  from_status text,
  to_status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_close_request_events TO service_role;
ALTER TABLE public.fund_close_request_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_close_request_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Close request history is append-only'; END $$;
CREATE TRIGGER close_request_events_append_only BEFORE UPDATE OR DELETE ON public.fund_close_request_events
FOR EACH ROW EXECUTE FUNCTION public.block_close_request_event_mutation();