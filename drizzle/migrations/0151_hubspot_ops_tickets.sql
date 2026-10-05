CREATE TABLE public.hubspot_ops_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hubspot_id text NOT NULL UNIQUE,
  pipeline_id text NOT NULL,
  pipeline_label text NOT NULL,
  stage_id text,
  stage_label text,
  stage_order int,
  stage_closed boolean NOT NULL DEFAULT false,
  subject text NOT NULL,
  content text,
  priority text,
  owner_name text,
  company_names text[] NOT NULL DEFAULT '{}',
  hubspot_created_at timestamptz,
  hubspot_updated_at timestamptz,
  kind text NOT NULL CHECK (kind IN ('fund','service_request')),
  status text NOT NULL CHECK (status IN ('linked','created','needs_review','service_request','dismissed')),
  review_reason text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  imported_by uuid,
  imported_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid,
  resolved_at timestamptz
);
GRANT ALL ON public.hubspot_ops_tickets TO service_role;
ALTER TABLE public.hubspot_ops_tickets ENABLE ROW LEVEL SECURITY;
CREATE INDEX hubspot_ops_tickets_offering_idx ON public.hubspot_ops_tickets(offering_id);