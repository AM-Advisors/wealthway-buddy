ALTER TABLE public.ct_rounds
  ADD COLUMN IF NOT EXISTS target_amount numeric,
  ADD COLUMN IF NOT EXISTS lead_investor text,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE IF NOT EXISTS public.ct_round_investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  round_id uuid REFERENCES public.ct_rounds(id) ON DELETE SET NULL,
  stakeholder_id uuid NOT NULL REFERENCES public.ct_stakeholders(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.ct_security_classes(id) ON DELETE SET NULL,
  security_id uuid REFERENCES public.ct_securities(id) ON DELETE SET NULL,
  instrument text NOT NULL DEFAULT 'priced',
  amount numeric NOT NULL DEFAULT 0,
  shares numeric,
  price_per_share numeric,
  valuation_cap numeric,
  discount_rate numeric,
  interest_rate numeric,
  maturity_date date,
  status text NOT NULL DEFAULT 'committed',
  commitment_date date,
  signed_at timestamptz,
  funded_at timestamptz,
  closed_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_round_investments TO authenticated;
GRANT ALL ON public.ct_round_investments TO service_role;

ALTER TABLE public.ct_round_investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View fundraising records"
  ON public.ct_round_investments FOR SELECT TO authenticated
  USING (public.ct_can_view(company_id));

CREATE POLICY "Manage fundraising records"
  ON public.ct_round_investments FOR ALL TO authenticated
  USING (public.ct_can_manage(company_id))
  WITH CHECK (public.ct_can_manage(company_id));

CREATE INDEX IF NOT EXISTS ct_round_investments_company_idx ON public.ct_round_investments(company_id);
CREATE INDEX IF NOT EXISTS ct_round_investments_round_idx ON public.ct_round_investments(round_id);

CREATE TRIGGER ct_round_investments_set_updated_at
  BEFORE UPDATE ON public.ct_round_investments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();