CREATE TABLE public.client_fund_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_by uuid,
  submitted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX client_fund_intakes_one_draft
  ON public.client_fund_intakes (client_id)
  WHERE status = 'draft';

CREATE INDEX client_fund_intakes_client_idx ON public.client_fund_intakes (client_id);

GRANT SELECT, INSERT, UPDATE ON public.client_fund_intakes TO authenticated;
GRANT ALL ON public.client_fund_intakes TO service_role;

ALTER TABLE public.client_fund_intakes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client contacts read their own intakes"
  ON public.client_fund_intakes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_users cu
      WHERE cu.client_id = client_fund_intakes.client_id AND cu.user_id = auth.uid()
    )
  );

CREATE POLICY "Client contacts write their own intakes"
  ON public.client_fund_intakes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.client_users cu
      WHERE cu.client_id = client_fund_intakes.client_id
        AND cu.user_id = auth.uid()
        AND cu.client_role <> 'client_readonly'
    )
  );

CREATE POLICY "Client contacts update their own intakes"
  ON public.client_fund_intakes FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_users cu
      WHERE cu.client_id = client_fund_intakes.client_id
        AND cu.user_id = auth.uid()
        AND cu.client_role <> 'client_readonly'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.client_users cu
      WHERE cu.client_id = client_fund_intakes.client_id
        AND cu.user_id = auth.uid()
        AND cu.client_role <> 'client_readonly'
    )
  );

CREATE POLICY "Staff read every intake"
  ON public.client_fund_intakes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','super_admin','legal','compliance','finance','client_success','executive','operations','fund_administration','tax')
    )
  );

CREATE POLICY "Staff update every intake"
  ON public.client_fund_intakes FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','super_admin','legal','compliance','finance','client_success','executive')
    )
  )
  WITH CHECK (true);

CREATE TRIGGER client_fund_intakes_set_updated_at
  BEFORE UPDATE ON public.client_fund_intakes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();