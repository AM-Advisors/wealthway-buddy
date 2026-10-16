ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS menu_gating text NOT NULL DEFAULT 'legacy';
COMMENT ON COLUMN public.clients.menu_gating IS 'legacy = full role menu; entitlements = menu and pages limited to purchased services';

CREATE TABLE public.saas_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  user_id uuid NOT NULL,
  company_name text NOT NULL,
  billing_interval text NOT NULL CHECK (billing_interval IN ('annual','quarterly')),
  selection jsonb NOT NULL,
  price_snapshot jsonb NOT NULL,
  recurring_cents integer NOT NULL DEFAULT 0,
  one_time_cents integer NOT NULL DEFAULT 0,
  msa_version text NOT NULL,
  msa_accepted_at timestamptz NOT NULL,
  signer_name text NOT NULL,
  signer_title text,
  signed_ip text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  activation_mode text NOT NULL DEFAULT 'saas_clickthrough',
  payment_status text NOT NULL DEFAULT 'unpaid',
  environment text NOT NULL DEFAULT 'sandbox',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  kyb_status text NOT NULL DEFAULT 'not_started',
  kyb_details jsonb,
  kyb_decided_by uuid,
  kyb_decided_at timestamptz,
  kyb_note text,
  status text NOT NULL DEFAULT 'signed',
  activated_at timestamptz,
  legal_reviewed_by uuid,
  legal_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.saas_orders TO authenticated;
GRANT ALL ON public.saas_orders TO service_role;
ALTER TABLE public.saas_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signers read own SaaS orders" ON public.saas_orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX saas_orders_client_idx ON public.saas_orders(client_id);

CREATE TABLE public.saas_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.saas_orders(id),
  actor_id uuid,
  event_kind text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.saas_order_events TO authenticated;
GRANT ALL ON public.saas_order_events TO service_role;
ALTER TABLE public.saas_order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signers read own SaaS order events" ON public.saas_order_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.saas_orders o WHERE o.id = order_id AND o.user_id = auth.uid()));
CREATE OR REPLACE FUNCTION public.saas_order_events_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'SaaS order events are append-only'; END $$;
CREATE TRIGGER saas_order_events_no_change BEFORE UPDATE OR DELETE ON public.saas_order_events
  FOR EACH ROW EXECUTE FUNCTION public.saas_order_events_immutable();