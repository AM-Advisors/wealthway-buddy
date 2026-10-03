CREATE TABLE public.fund_liabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  description text NOT NULL,
  kind text NOT NULL DEFAULT 'accrued_expense' CHECK (kind IN ('accrued_expense','payable','loan','management_fee_payable','other')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  incurred_on date NOT NULL,
  settled_on date,
  note text,
  created_by uuid NOT NULL,
  settled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fund_liabilities_offering_idx ON public.fund_liabilities(offering_id);
GRANT ALL ON public.fund_liabilities TO service_role;
ALTER TABLE public.fund_liabilities ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.fund_liabilities IS 'Fund-level liabilities for the books; server-only access via fund-books.server.ts. Settled rows are kept, never deleted.';