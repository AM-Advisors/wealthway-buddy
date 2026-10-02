CREATE TABLE public.fund_franchise_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL,
  state text NOT NULL,
  description text,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  due_date date,
  filed_on date,
  confirmation_number text,
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by uuid
);
CREATE INDEX fund_franchise_fees_offering_idx ON public.fund_franchise_fees(offering_id);
GRANT ALL ON public.fund_franchise_fees TO service_role;
ALTER TABLE public.fund_franchise_fees ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.fund_franchise_fees IS 'Record-only state franchise tax/fee tracking per fund; never pays anything. Accessed only through access-checked server functions.';