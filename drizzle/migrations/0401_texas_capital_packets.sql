CREATE TABLE public.texas_capital_packets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.offering_bank_setup_requests(id) ON DELETE SET NULL,
  entity_kind text NOT NULL DEFAULT 'llc' CHECK (entity_kind IN ('llc','corporation')),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  documents jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','approved','sent','opened','account_opened','cancelled')),
  prepared_by uuid,
  ready_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  storage_path text,
  token_hash text,
  link_expires_at timestamptz,
  link_revoked_at timestamptz,
  sent_by uuid,
  sent_at timestamptz,
  first_opened_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX texas_capital_packets_offering_idx ON public.texas_capital_packets(offering_id);
CREATE UNIQUE INDEX texas_capital_packets_token_idx ON public.texas_capital_packets(token_hash) WHERE token_hash IS NOT NULL;
GRANT ALL ON public.texas_capital_packets TO service_role;
ALTER TABLE public.texas_capital_packets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.texas_capital_packet_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL REFERENCES public.texas_capital_packets(id) ON DELETE CASCADE,
  event text NOT NULL,
  actor_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX texas_capital_packet_events_packet_idx ON public.texas_capital_packet_events(packet_id, created_at);
GRANT SELECT, INSERT ON public.texas_capital_packet_events TO service_role;
ALTER TABLE public.texas_capital_packet_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_texas_capital_packet_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Texas Capital package history cannot be changed'; END $$;
CREATE TRIGGER texas_capital_packet_events_append_only BEFORE UPDATE OR DELETE ON public.texas_capital_packet_events
FOR EACH ROW EXECUTE FUNCTION public.block_texas_capital_packet_event_mutation();