-- Harmonious CapTable: ownership operating system schema

CREATE TABLE public.ct_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  legal_name text,
  entity_type text,
  jurisdiction text,
  incorporation_date date,
  authorized_shares numeric NOT NULL DEFAULT 0,
  par_value numeric,
  fiscal_year_end text,
  currency text NOT NULL DEFAULT 'USD',
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ct_stakeholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  user_id uuid,
  name text NOT NULL,
  email text,
  stakeholder_type text NOT NULL DEFAULT 'investor',
  entity_name text,
  title text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ct_security_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'common',
  seniority integer NOT NULL DEFAULT 0,
  authorized numeric,
  price_per_share numeric,
  liquidation_preference numeric,
  conversion_ratio numeric NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ct_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  round_type text NOT NULL DEFAULT 'priced',
  close_date date,
  pre_money numeric,
  amount_raised numeric,
  price_per_share numeric,
  status text NOT NULL DEFAULT 'closed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ct_vesting_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date,
  cliff_months integer NOT NULL DEFAULT 12,
  duration_months integer NOT NULL DEFAULT 48,
  frequency text NOT NULL DEFAULT 'monthly',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ct_securities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  stakeholder_id uuid NOT NULL REFERENCES public.ct_stakeholders(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.ct_security_classes(id) ON DELETE SET NULL,
  round_id uuid REFERENCES public.ct_rounds(id) ON DELETE SET NULL,
  vesting_schedule_id uuid REFERENCES public.ct_vesting_schedules(id) ON DELETE SET NULL,
  security_type text NOT NULL DEFAULT 'common',
  label text,
  quantity numeric NOT NULL DEFAULT 0,
  issue_date date,
  purchase_price numeric,
  exercise_price numeric,
  principal numeric,
  valuation_cap numeric,
  discount_rate numeric,
  transfer_restrictions text,
  status text NOT NULL DEFAULT 'recorded',
  verification_status text NOT NULL DEFAULT 'verified',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ct_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  security_id uuid REFERENCES public.ct_securities(id) ON DELETE CASCADE,
  stakeholder_id uuid REFERENCES public.ct_stakeholders(id) ON DELETE SET NULL,
  counterparty_stakeholder_id uuid REFERENCES public.ct_stakeholders(id) ON DELETE SET NULL,
  round_id uuid REFERENCES public.ct_rounds(id) ON DELETE SET NULL,
  kind text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  amount numeric,
  effective_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'recorded',
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ct_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  doc_type text NOT NULL DEFAULT 'other',
  storage_path text,
  linked_type text,
  linked_id uuid,
  status text NOT NULL DEFAULT 'recorded',
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ct_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  previous_state jsonb,
  new_state jsonb,
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ct_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  user_id uuid,
  kind text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ct_stakeholders_company_idx ON public.ct_stakeholders(company_id);
CREATE INDEX ct_security_classes_company_idx ON public.ct_security_classes(company_id);
CREATE INDEX ct_rounds_company_idx ON public.ct_rounds(company_id);
CREATE INDEX ct_securities_company_idx ON public.ct_securities(company_id);
CREATE INDEX ct_securities_stakeholder_idx ON public.ct_securities(stakeholder_id);
CREATE INDEX ct_transactions_company_idx ON public.ct_transactions(company_id);
CREATE INDEX ct_transactions_security_idx ON public.ct_transactions(security_id);
CREATE INDEX ct_documents_company_idx ON public.ct_documents(company_id);
CREATE INDEX ct_events_company_idx ON public.ct_events(company_id, occurred_at DESC);
CREATE INDEX ct_notifications_user_idx ON public.ct_notifications(user_id, read_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_companies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_stakeholders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_security_classes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_rounds TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_vesting_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_securities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_documents TO authenticated;
GRANT SELECT, INSERT ON public.ct_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ct_notifications TO authenticated;
GRANT ALL ON public.ct_companies TO service_role;
GRANT ALL ON public.ct_stakeholders TO service_role;
GRANT ALL ON public.ct_security_classes TO service_role;
GRANT ALL ON public.ct_rounds TO service_role;
GRANT ALL ON public.ct_vesting_schedules TO service_role;
GRANT ALL ON public.ct_securities TO service_role;
GRANT ALL ON public.ct_transactions TO service_role;
GRANT ALL ON public.ct_documents TO service_role;
GRANT ALL ON public.ct_events TO service_role;
GRANT ALL ON public.ct_notifications TO service_role;

-- access helpers -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ct_is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid()
      AND r.role::text IN ('admin','super_admin','operations','legal','fund_administration')
  );
$$;

CREATE OR REPLACE FUNCTION public.ct_can_view(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ct_companies c
    WHERE c.id = _company_id
      AND (
        c.is_demo
        OR public.ct_is_staff()
        OR EXISTS (
          SELECT 1 FROM public.client_users cu
          WHERE cu.client_id = c.client_id AND cu.user_id = auth.uid()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.ct_can_manage(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ct_companies c
    WHERE c.id = _company_id
      AND NOT c.is_demo
      AND (
        public.ct_is_staff()
        OR EXISTS (
          SELECT 1 FROM public.client_users cu
          WHERE cu.client_id = c.client_id
            AND cu.user_id = auth.uid()
            AND cu.client_role <> 'client_readonly'
        )
      )
  );
$$;

ALTER TABLE public.ct_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ct_stakeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ct_security_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ct_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ct_vesting_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ct_securities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ct_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ct_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ct_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ct_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ct_companies_read" ON public.ct_companies FOR SELECT TO authenticated
  USING (public.ct_can_view(id));
CREATE POLICY "ct_companies_write" ON public.ct_companies FOR UPDATE TO authenticated
  USING (public.ct_can_manage(id)) WITH CHECK (public.ct_can_manage(id));
CREATE POLICY "ct_companies_insert" ON public.ct_companies FOR INSERT TO authenticated
  WITH CHECK (
    NOT is_demo AND (
      public.ct_is_staff()
      OR EXISTS (
        SELECT 1 FROM public.client_users cu
        WHERE cu.client_id = client_id AND cu.user_id = auth.uid() AND cu.client_role <> 'client_readonly'
      )
    )
  );

CREATE POLICY "ct_stakeholders_read" ON public.ct_stakeholders FOR SELECT TO authenticated USING (public.ct_can_view(company_id));
CREATE POLICY "ct_stakeholders_all" ON public.ct_stakeholders FOR ALL TO authenticated
  USING (public.ct_can_manage(company_id)) WITH CHECK (public.ct_can_manage(company_id));

CREATE POLICY "ct_classes_read" ON public.ct_security_classes FOR SELECT TO authenticated USING (public.ct_can_view(company_id));
CREATE POLICY "ct_classes_all" ON public.ct_security_classes FOR ALL TO authenticated
  USING (public.ct_can_manage(company_id)) WITH CHECK (public.ct_can_manage(company_id));

CREATE POLICY "ct_rounds_read" ON public.ct_rounds FOR SELECT TO authenticated USING (public.ct_can_view(company_id));
CREATE POLICY "ct_rounds_all" ON public.ct_rounds FOR ALL TO authenticated
  USING (public.ct_can_manage(company_id)) WITH CHECK (public.ct_can_manage(company_id));

CREATE POLICY "ct_vesting_read" ON public.ct_vesting_schedules FOR SELECT TO authenticated USING (public.ct_can_view(company_id));
CREATE POLICY "ct_vesting_all" ON public.ct_vesting_schedules FOR ALL TO authenticated
  USING (public.ct_can_manage(company_id)) WITH CHECK (public.ct_can_manage(company_id));

CREATE POLICY "ct_securities_read" ON public.ct_securities FOR SELECT TO authenticated USING (public.ct_can_view(company_id));
CREATE POLICY "ct_securities_all" ON public.ct_securities FOR ALL TO authenticated
  USING (public.ct_can_manage(company_id)) WITH CHECK (public.ct_can_manage(company_id));

CREATE POLICY "ct_transactions_read" ON public.ct_transactions FOR SELECT TO authenticated USING (public.ct_can_view(company_id));
CREATE POLICY "ct_transactions_all" ON public.ct_transactions FOR ALL TO authenticated
  USING (public.ct_can_manage(company_id)) WITH CHECK (public.ct_can_manage(company_id));

CREATE POLICY "ct_documents_read" ON public.ct_documents FOR SELECT TO authenticated USING (public.ct_can_view(company_id));
CREATE POLICY "ct_documents_all" ON public.ct_documents FOR ALL TO authenticated
  USING (public.ct_can_manage(company_id)) WITH CHECK (public.ct_can_manage(company_id));

CREATE POLICY "ct_events_read" ON public.ct_events FOR SELECT TO authenticated USING (public.ct_can_view(company_id));
CREATE POLICY "ct_events_insert" ON public.ct_events FOR INSERT TO authenticated
  WITH CHECK (public.ct_can_manage(company_id) AND actor_id = auth.uid());

CREATE POLICY "ct_notifications_read" ON public.ct_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.ct_can_view(company_id));
CREATE POLICY "ct_notifications_update" ON public.ct_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "ct_notifications_insert" ON public.ct_notifications FOR INSERT TO authenticated
  WITH CHECK (public.ct_can_manage(company_id));

CREATE TRIGGER ct_companies_updated BEFORE UPDATE ON public.ct_companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ct_stakeholders_updated BEFORE UPDATE ON public.ct_stakeholders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ct_classes_updated BEFORE UPDATE ON public.ct_security_classes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ct_rounds_updated BEFORE UPDATE ON public.ct_rounds FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ct_vesting_updated BEFORE UPDATE ON public.ct_vesting_schedules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ct_securities_updated BEFORE UPDATE ON public.ct_securities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ct_transactions_updated BEFORE UPDATE ON public.ct_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ct_documents_updated BEFORE UPDATE ON public.ct_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ct_notifications_updated BEFORE UPDATE ON public.ct_notifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- demo company ---------------------------------------------------------------

DO $seed$
DECLARE
  co uuid := gen_random_uuid();
  cls_common uuid := gen_random_uuid();
  cls_a uuid := gen_random_uuid();
  cls_seed uuid := gen_random_uuid();
  cls_pool uuid := gen_random_uuid();
  rnd_seed uuid := gen_random_uuid();
  rnd_a uuid := gen_random_uuid();
  vest uuid := gen_random_uuid();
  sh_founder1 uuid := gen_random_uuid();
  sh_founder2 uuid := gen_random_uuid();
  sh_emp1 uuid := gen_random_uuid();
  sh_emp2 uuid := gen_random_uuid();
  sh_emp3 uuid := gen_random_uuid();
  sh_inst uuid := gen_random_uuid();
  sh_angel uuid := gen_random_uuid();
  sh_spv uuid := gen_random_uuid();
  sec record;
BEGIN
  INSERT INTO public.ct_companies (id, client_id, name, legal_name, entity_type, jurisdiction, incorporation_date, authorized_shares, par_value, fiscal_year_end, is_demo)
  VALUES (co, NULL, 'Northwind Robotics', 'Northwind Robotics, Inc.', 'C Corporation', 'Delaware', '2021-03-14', 15000000, 0.00001, '12-31', true);

  INSERT INTO public.ct_security_classes (id, company_id, name, kind, seniority, authorized, price_per_share, liquidation_preference, conversion_ratio) VALUES
    (cls_common, co, 'Common Stock', 'common', 0, 10000000, 0.0001, NULL, 1),
    (cls_seed, co, 'Seed Preferred', 'preferred', 1, 1800000, 0.92, 1, 1),
    (cls_a, co, 'Series A Preferred', 'preferred', 2, 2200000, 2.35, 1, 1),
    (cls_pool, co, '2021 Equity Incentive Plan', 'option_pool', 0, 1500000, NULL, NULL, 1);

  INSERT INTO public.ct_rounds (id, company_id, name, round_type, close_date, pre_money, amount_raised, price_per_share, status) VALUES
    (rnd_seed, co, 'Seed', 'priced', '2022-05-18', 8000000, 1600000, 0.92, 'closed'),
    (rnd_a, co, 'Series A', 'priced', '2024-02-09', 26000000, 5170000, 2.35, 'closed');

  INSERT INTO public.ct_vesting_schedules (id, company_id, name, start_date, cliff_months, duration_months, frequency)
  VALUES (vest, co, '4 years, 1 year cliff', '2022-01-01', 12, 48, 'monthly');

  INSERT INTO public.ct_stakeholders (id, company_id, name, email, stakeholder_type, entity_name, title) VALUES
    (sh_founder1, co, 'Dana Whitfield', 'dana@northwindrobotics.demo', 'founder', NULL, 'Chief Executive Officer'),
    (sh_founder2, co, 'Marcus Lee', 'marcus@northwindrobotics.demo', 'founder', NULL, 'Chief Technology Officer'),
    (sh_emp1, co, 'Priya Raman', 'priya@northwindrobotics.demo', 'employee', NULL, 'VP Engineering'),
    (sh_emp2, co, 'Tom Alvarez', 'tom@northwindrobotics.demo', 'employee', NULL, 'Head of Sales'),
    (sh_emp3, co, 'Sofia Brandt', 'sofia@northwindrobotics.demo', 'employee', NULL, 'Staff Engineer'),
    (sh_inst, co, 'Cedar Ridge Ventures II, L.P.', 'ops@cedarridge.demo', 'investor', 'Cedar Ridge Ventures II, L.P.', 'Lead investor'),
    (sh_angel, co, 'Helen Ortiz', 'helen@ortizangel.demo', 'investor', NULL, 'Angel'),
    (sh_spv, co, 'Lattice SPV I, LLC', 'admin@latticespv.demo', 'spv', 'Lattice SPV I, LLC', 'Special purpose vehicle');

  INSERT INTO public.ct_securities (company_id, stakeholder_id, class_id, round_id, vesting_schedule_id, security_type, label, quantity, issue_date, purchase_price, exercise_price, principal, valuation_cap, discount_rate, transfer_restrictions, status, verification_status) VALUES
    (co, sh_founder1, cls_common, NULL, vest, 'common', 'CS-1', 3200000, '2021-03-20', 0.0001, NULL, NULL, NULL, NULL, 'Board consent and right of first refusal', 'recorded', 'verified'),
    (co, sh_founder2, cls_common, NULL, vest, 'common', 'CS-2', 2600000, '2021-03-20', 0.0001, NULL, NULL, NULL, NULL, 'Board consent and right of first refusal', 'recorded', 'verified'),
    (co, sh_angel, cls_seed, rnd_seed, NULL, 'preferred', 'PS-3', 217391, '2022-05-18', 0.92, NULL, NULL, NULL, NULL, 'Right of first refusal', 'recorded', 'verified'),
    (co, sh_inst, cls_seed, rnd_seed, NULL, 'preferred', 'PS-4', 1521739, '2022-05-18', 0.92, NULL, NULL, NULL, NULL, 'Right of first refusal', 'recorded', 'verified'),
    (co, sh_inst, cls_a, rnd_a, NULL, 'preferred', 'PA-5', 1702127, '2024-02-09', 2.35, NULL, NULL, NULL, NULL, 'Right of first refusal and co-sale', 'recorded', 'verified'),
    (co, sh_spv, cls_a, rnd_a, NULL, 'spv_interest', 'PA-6', 497872, '2024-02-09', 2.35, NULL, NULL, NULL, NULL, 'Issuer consent required for transfer', 'recorded', 'pending'),
    (co, sh_emp1, cls_pool, NULL, vest, 'option', 'OP-11', 180000, '2022-07-01', NULL, 0.21, NULL, NULL, NULL, 'Plan transfer restrictions', 'recorded', 'verified'),
    (co, sh_emp2, cls_pool, NULL, vest, 'option', 'OP-12', 95000, '2023-01-16', NULL, 0.34, NULL, NULL, NULL, 'Plan transfer restrictions', 'recorded', 'verified'),
    (co, sh_emp3, cls_pool, NULL, vest, 'rsu', 'RSU-3', 40000, '2025-04-01', NULL, NULL, NULL, NULL, NULL, 'Plan transfer restrictions', 'recorded', 'verified'),
    (co, sh_angel, NULL, NULL, NULL, 'safe', 'SAFE-1', 0, '2025-06-30', NULL, NULL, 250000, 12000000, 20, 'Transfer requires company consent', 'recorded', 'verified'),
    (co, sh_inst, NULL, NULL, NULL, 'safe', 'SAFE-2', 0, '2025-09-12', NULL, NULL, 500000, 15000000, 15, 'Transfer requires company consent', 'recorded', 'verified'),
    (co, sh_angel, NULL, NULL, NULL, 'note', 'CN-1', 0, '2025-11-04', NULL, NULL, 300000, 18000000, 10, 'Transfer requires company consent', 'recorded', 'verified');

  FOR sec IN SELECT id, stakeholder_id, quantity, issue_date, security_type, round_id, purchase_price FROM public.ct_securities WHERE company_id = co LOOP
    INSERT INTO public.ct_transactions (company_id, security_id, stakeholder_id, round_id, kind, quantity, amount, effective_date, status, reason)
    VALUES (
      co, sec.id, sec.stakeholder_id, sec.round_id,
      CASE WHEN sec.security_type IN ('option','rsu') THEN 'grant' ELSE 'issuance' END,
      sec.quantity,
      COALESCE(sec.quantity * COALESCE(sec.purchase_price, 0), 0),
      COALESCE(sec.issue_date, current_date), 'recorded', 'Original record'
    );
  END LOOP;

  INSERT INTO public.ct_events (company_id, actor_id, action, entity_type, reason, occurred_at) VALUES
    (co, NULL, 'company.created', 'company', 'Demo company created for evaluation', now() - interval '40 days'),
    (co, NULL, 'round.closed', 'round', 'Series A closed and issued', now() - interval '30 days'),
    (co, NULL, 'grant.issued', 'security', 'Employee grant recorded', now() - interval '12 days'),
    (co, NULL, 'transfer.requested', 'transfer', 'Secondary transfer submitted for review', now() - interval '5 days');
END
$seed$;