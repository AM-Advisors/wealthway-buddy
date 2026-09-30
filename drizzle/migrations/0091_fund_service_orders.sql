CREATE TABLE public.fund_service_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('formation','ein','boi')),
  status text NOT NULL DEFAULT 'not_started',
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  prepared_by uuid,
  prepared_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_id, kind)
);
GRANT ALL ON public.fund_service_orders TO service_role;
ALTER TABLE public.fund_service_orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.fund_service_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.fund_service_orders(id) ON DELETE CASCADE,
  actor_user_id uuid,
  event text NOT NULL,
  from_status text,
  to_status text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_service_order_events TO service_role;
ALTER TABLE public.fund_service_order_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.fund_boi_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  person_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('beneficial_owner','company_applicant')),
  id_document_provided boolean NOT NULL DEFAULT false,
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by uuid
);
CREATE UNIQUE INDEX fund_boi_parties_active_uq ON public.fund_boi_parties (offering_id, person_id, role) WHERE removed_at IS NULL;
GRANT ALL ON public.fund_boi_parties TO service_role;
ALTER TABLE public.fund_boi_parties ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_service_order_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('harmonious.fund_delete', true) = 'on' THEN RETURN COALESCE(OLD, NEW); END IF;
  RAISE EXCEPTION 'fund_service_order_events is append-only';
END $$;
CREATE TRIGGER fund_service_order_events_append_only
BEFORE UPDATE OR DELETE ON public.fund_service_order_events
FOR EACH ROW EXECUTE FUNCTION public.block_service_order_event_mutation();