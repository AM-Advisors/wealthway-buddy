CREATE TABLE public.cap_table_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  company_id uuid REFERENCES public.ct_companies(id),
  company_name text NOT NULL,
  tier text NOT NULL,
  billing_interval text NOT NULL DEFAULT 'monthly',
  status text NOT NULL DEFAULT 'pending_payment',
  environment text NOT NULL DEFAULT 'sandbox',
  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cap_table_subscriptions TO authenticated;
GRANT ALL ON public.cap_table_subscriptions TO service_role;
ALTER TABLE public.cap_table_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client members read their cap table subscriptions" ON public.cap_table_subscriptions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = cap_table_subscriptions.client_id AND cu.user_id = auth.uid()));
CREATE INDEX cap_table_subscriptions_client_idx ON public.cap_table_subscriptions(client_id, environment);

CREATE TABLE public.cap_table_subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.cap_table_subscriptions(id),
  actor_id uuid,
  event_kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.cap_table_subscription_events TO service_role;
ALTER TABLE public.cap_table_subscription_events ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.cap_table_subscription_events IS 'Append-only; written only by server code and the payments webhook.';
CREATE TRIGGER cap_table_subscription_events_no_mutation BEFORE UPDATE OR DELETE ON public.cap_table_subscription_events
  FOR EACH ROW EXECUTE FUNCTION public.client_contact_events_append_only();