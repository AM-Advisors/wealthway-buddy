CREATE TABLE public.fund_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  kind text NOT NULL CHECK (kind IN ('new_fund_request','service_request')),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled','used')),
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  stripe_session_id text,
  stripe_payment_intent_id text,
  used_for uuid,
  paid_at timestamptz,
  used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fund_payments TO authenticated;
GRANT ALL ON public.fund_payments TO service_role;
ALTER TABLE public.fund_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client members read their fund payments" ON public.fund_payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = fund_payments.client_id AND cu.user_id = auth.uid()));
CREATE INDEX fund_payments_client_idx ON public.fund_payments(client_id, created_at DESC);

CREATE TABLE public.fund_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.fund_payments(id),
  event_kind text NOT NULL,
  actor_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_payment_events TO service_role;
ALTER TABLE public.fund_payment_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER fund_payment_events_append_only BEFORE UPDATE OR DELETE ON public.fund_payment_events
  FOR EACH ROW EXECUTE FUNCTION public.client_contact_events_append_only();