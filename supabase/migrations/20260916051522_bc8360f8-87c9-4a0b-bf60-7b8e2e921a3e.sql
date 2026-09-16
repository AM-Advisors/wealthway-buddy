CREATE TABLE IF NOT EXISTS public.ct_secondary_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  security_id uuid REFERENCES public.ct_securities(id) ON DELETE SET NULL,
  seller_stakeholder_id uuid NOT NULL REFERENCES public.ct_stakeholders(id) ON DELETE CASCADE,
  buyer_stakeholder_id uuid REFERENCES public.ct_stakeholders(id) ON DELETE SET NULL,
  buyer_name text,
  buyer_email text,
  buyer_type text,
  quantity numeric NOT NULL DEFAULT 0,
  price_per_share numeric,
  amount numeric,
  status text NOT NULL DEFAULT 'draft',
  requested_on date,
  restriction_status text NOT NULL DEFAULT 'not_started',
  restriction_note text,
  restriction_reviewed_at timestamptz,
  restriction_reviewed_by uuid,
  rofr_status text NOT NULL DEFAULT 'not_started',
  rofr_deadline date,
  rofr_note text,
  rofr_decided_at timestamptz,
  rofr_decided_by uuid,
  consent_status text NOT NULL DEFAULT 'pending',
  consent_note text,
  consent_decided_at timestamptz,
  consent_decided_by uuid,
  closed_at timestamptz,
  closing_date date,
  buyer_security_id uuid REFERENCES public.ct_securities(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_secondary_transfers TO authenticated;
GRANT ALL ON public.ct_secondary_transfers TO service_role;

ALTER TABLE public.ct_secondary_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View secondary transfers"
  ON public.ct_secondary_transfers FOR SELECT TO authenticated
  USING (public.ct_can_view(company_id));

CREATE POLICY "Manage secondary transfers"
  ON public.ct_secondary_transfers FOR ALL TO authenticated
  USING (public.ct_can_manage(company_id))
  WITH CHECK (public.ct_can_manage(company_id));

CREATE INDEX IF NOT EXISTS ct_secondary_transfers_company_idx ON public.ct_secondary_transfers(company_id);
CREATE INDEX IF NOT EXISTS ct_secondary_transfers_seller_idx ON public.ct_secondary_transfers(seller_stakeholder_id);

CREATE TRIGGER ct_secondary_transfers_set_updated_at
  BEFORE UPDATE ON public.ct_secondary_transfers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();