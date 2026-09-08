CREATE TABLE public.wire_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.investor_applications(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  amount_cents bigint NOT NULL,
  sent_on date NOT NULL,
  sending_bank_name text NOT NULL,
  sending_account_last4 text NOT NULL,
  bank_reference text,
  investor_note text,
  status text NOT NULL DEFAULT 'submitted',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wire_confirmations_status_check CHECK (status IN ('submitted','approved','rejected')),
  CONSTRAINT wire_confirmations_last4_check CHECK (sending_account_last4 ~ '^[0-9]{4}$'),
  CONSTRAINT wire_confirmations_amount_check CHECK (amount_cents > 0)
);

CREATE INDEX wire_confirmations_app_idx ON public.wire_confirmations (application_id, created_at DESC);
CREATE INDEX wire_confirmations_status_idx ON public.wire_confirmations (status, created_at DESC);

GRANT SELECT, INSERT ON public.wire_confirmations TO authenticated;
GRANT UPDATE ON public.wire_confirmations TO authenticated;
GRANT ALL ON public.wire_confirmations TO service_role;

ALTER TABLE public.wire_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Investors read own wire confirmations"
ON public.wire_confirmations FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.investor_applications a
  WHERE a.id = application_id AND a.user_id = auth.uid()
));

CREATE POLICY "Investors create own wire confirmations"
ON public.wire_confirmations FOR INSERT TO authenticated
WITH CHECK (
  status = 'submitted'
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
  AND review_notes IS NULL
  AND EXISTS (
    SELECT 1 FROM public.investor_applications a
    WHERE a.id = application_id AND a.user_id = auth.uid()
  )
);

CREATE POLICY "Admins read wire confirmations"
ON public.wire_confirmations FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins decide wire confirmations"
ON public.wire_confirmations FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Fund managers read wire confirmations"
ON public.wire_confirmations FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.investor_applications a
  JOIN public.fund_managers fm ON fm.offering_id = a.offering_id
  WHERE a.id = application_id AND fm.user_id = auth.uid()
));

CREATE POLICY "Fund managers decide wire confirmations"
ON public.wire_confirmations FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.investor_applications a
  JOIN public.fund_managers fm ON fm.offering_id = a.offering_id
  WHERE a.id = application_id AND fm.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.investor_applications a
  JOIN public.fund_managers fm ON fm.offering_id = a.offering_id
  WHERE a.id = application_id AND fm.user_id = auth.uid()
));

CREATE TRIGGER wire_confirmations_updated
BEFORE UPDATE ON public.wire_confirmations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();