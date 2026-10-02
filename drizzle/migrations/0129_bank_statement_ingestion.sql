CREATE TABLE public.bank_statement_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'parsed' CHECK (status IN ('parsed','applied','failed')),
  bank_name text,
  account_mask text,
  period_start date,
  period_end date,
  opening_balance_cents bigint,
  closing_balance_cents bigint,
  parse_error text,
  uploaded_by uuid NOT NULL,
  applied_by uuid,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bank_statement_uploads_offering_idx ON public.bank_statement_uploads(offering_id, created_at DESC);
GRANT ALL ON public.bank_statement_uploads TO service_role;
ALTER TABLE public.bank_statement_uploads ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.bank_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES public.bank_statement_uploads(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  line_no int NOT NULL,
  posted_on date NOT NULL,
  description text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  direction text NOT NULL CHECK (direction IN ('in','out')),
  suggested_category text,
  confirmed_category text,
  matched_onboarding_id uuid REFERENCES public.investor_onboardings(id) ON DELETE SET NULL,
  duplicate_of uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  skip boolean NOT NULL DEFAULT false,
  applied_tx_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bank_statement_lines_upload_idx ON public.bank_statement_lines(upload_id, line_no);
GRANT ALL ON public.bank_statement_lines TO service_role;
ALTER TABLE public.bank_statement_lines ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.bank_statement_uploads IS 'Uploaded bank statements read by AI; lines are applied only after a person confirms them. Records history only, never moves money. Server functions only.';