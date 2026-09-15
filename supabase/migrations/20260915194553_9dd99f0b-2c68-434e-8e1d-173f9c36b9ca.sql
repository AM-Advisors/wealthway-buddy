
CREATE TABLE public.cap_stakeholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  holder_type text NOT NULL DEFAULT 'individual',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cap_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  stakeholder_id uuid NOT NULL REFERENCES public.cap_stakeholders(id) ON DELETE CASCADE,
  security_type text NOT NULL DEFAULT 'common',
  share_class text,
  quantity numeric NOT NULL DEFAULT 0,
  price_per_share_cents bigint,
  issued_on date,
  certificate_no text,
  status text NOT NULL DEFAULT 'outstanding',
  source text NOT NULL DEFAULT 'manual',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cap_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  holding_id uuid NOT NULL REFERENCES public.cap_holdings(id) ON DELETE CASCADE,
  from_stakeholder_id uuid REFERENCES public.cap_stakeholders(id) ON DELETE SET NULL,
  to_stakeholder_id uuid REFERENCES public.cap_stakeholders(id) ON DELETE SET NULL,
  to_name text,
  to_email text,
  quantity numeric NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  decision_note text,
  requested_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cap_stakeholders_client_idx ON public.cap_stakeholders(client_id);
CREATE INDEX cap_holdings_client_idx ON public.cap_holdings(client_id);
CREATE INDEX cap_holdings_stakeholder_idx ON public.cap_holdings(stakeholder_id);
CREATE INDEX cap_transfers_client_idx ON public.cap_transfers(client_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cap_stakeholders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cap_holdings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cap_transfers TO authenticated;
GRANT ALL ON public.cap_stakeholders TO service_role;
GRANT ALL ON public.cap_holdings TO service_role;
GRANT ALL ON public.cap_transfers TO service_role;

ALTER TABLE public.cap_stakeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cap_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cap_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client contacts read cap stakeholders" ON public.cap_stakeholders FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = cap_stakeholders.client_id AND cu.user_id = auth.uid()));
CREATE POLICY "Client contacts write cap stakeholders" ON public.cap_stakeholders FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = cap_stakeholders.client_id AND cu.user_id = auth.uid() AND cu.client_role <> 'client_readonly'));
CREATE POLICY "Client contacts update cap stakeholders" ON public.cap_stakeholders FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = cap_stakeholders.client_id AND cu.user_id = auth.uid() AND cu.client_role <> 'client_readonly'));
CREATE POLICY "Staff read cap stakeholders" ON public.cap_stakeholders FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = ANY (ARRAY['admin','super_admin','legal','compliance','finance','client_success','executive','operations','fund_administration','tax']::app_role[])));

CREATE POLICY "Client contacts read cap holdings" ON public.cap_holdings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = cap_holdings.client_id AND cu.user_id = auth.uid()));
CREATE POLICY "Client contacts write cap holdings" ON public.cap_holdings FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = cap_holdings.client_id AND cu.user_id = auth.uid() AND cu.client_role <> 'client_readonly'));
CREATE POLICY "Client contacts update cap holdings" ON public.cap_holdings FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = cap_holdings.client_id AND cu.user_id = auth.uid() AND cu.client_role <> 'client_readonly'));
CREATE POLICY "Staff read cap holdings" ON public.cap_holdings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = ANY (ARRAY['admin','super_admin','legal','compliance','finance','client_success','executive','operations','fund_administration','tax']::app_role[])));

CREATE POLICY "Client contacts read cap transfers" ON public.cap_transfers FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = cap_transfers.client_id AND cu.user_id = auth.uid()));
CREATE POLICY "Client contacts write cap transfers" ON public.cap_transfers FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = cap_transfers.client_id AND cu.user_id = auth.uid() AND cu.client_role <> 'client_readonly'));
CREATE POLICY "Staff read cap transfers" ON public.cap_transfers FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = ANY (ARRAY['admin','super_admin','legal','compliance','finance','client_success','executive','operations','fund_administration','tax']::app_role[])));

CREATE TRIGGER cap_stakeholders_updated_at BEFORE UPDATE ON public.cap_stakeholders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER cap_holdings_updated_at BEFORE UPDATE ON public.cap_holdings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER cap_transfers_updated_at BEFORE UPDATE ON public.cap_transfers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
