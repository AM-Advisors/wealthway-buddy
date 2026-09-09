CREATE TABLE IF NOT EXISTS public.offering_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL UNIQUE REFERENCES public.offerings(id) ON DELETE CASCADE,
  headline text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  security_type text NOT NULL DEFAULT '',
  target_raise_cents bigint,
  min_investment_cents bigint,
  max_investment_cents bigint,
  management_fee_bps integer,
  carried_interest_bps integer,
  preferred_return_bps integer,
  fund_term_years numeric(4,1),
  investment_period_years numeric(4,1),
  first_closing_date date,
  final_closing_date date,
  capital_call_terms text NOT NULL DEFAULT '',
  distribution_policy text NOT NULL DEFAULT '',
  fees_and_expenses text NOT NULL DEFAULT '',
  transfer_restrictions text NOT NULL DEFAULT '',
  reporting text NOT NULL DEFAULT '',
  other_terms text NOT NULL DEFAULT '',
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offering_statements TO authenticated;
GRANT ALL ON public.offering_statements TO service_role;

ALTER TABLE public.offering_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "offering statement readable" ON public.offering_statements;
CREATE POLICY "offering statement readable"
  ON public.offering_statements
  FOR SELECT
  TO authenticated
  USING (
    public.can_manage_diligence(offering_id)
    OR (is_published AND public.can_view_diligence(offering_id))
  );

DROP POLICY IF EXISTS "offering statement editable by fund team" ON public.offering_statements;
CREATE POLICY "offering statement editable by fund team"
  ON public.offering_statements
  FOR ALL
  TO authenticated
  USING (public.can_manage_diligence(offering_id))
  WITH CHECK (public.can_manage_diligence(offering_id));

DROP TRIGGER IF EXISTS offering_statements_set_updated_at ON public.offering_statements;
CREATE TRIGGER offering_statements_set_updated_at
  BEFORE UPDATE ON public.offering_statements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();