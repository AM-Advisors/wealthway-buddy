CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sow_id uuid REFERENCES public.client_sows(id) ON DELETE SET NULL,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  number text UNIQUE,
  status text NOT NULL DEFAULT 'draft',
  period_start date,
  period_end date,
  issue_date date,
  due_date date,
  net_days integer NOT NULL DEFAULT 30,
  currency text NOT NULL DEFAULT 'USD',
  total_cents bigint NOT NULL DEFAULT 0,
  note text,
  issued_by uuid,
  issued_at timestamptz,
  paid_on date,
  payment_reference text,
  voided_at timestamptz,
  void_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_status_check CHECK (status IN ('draft','issued','paid','void'))
);

CREATE TABLE public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'manual',
  service_key text,
  label text NOT NULL,
  description text,
  quantity integer NOT NULL DEFAULT 1,
  unit_cents bigint NOT NULL DEFAULT 0,
  amount_cents bigint NOT NULL DEFAULT 0,
  pricing_id uuid REFERENCES public.client_pricing(id) ON DELETE SET NULL,
  expense_id uuid REFERENCES public.pass_through_expenses(id) ON DELETE SET NULL,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_lines_source_check CHECK (source IN ('rate','expense','manual'))
);

CREATE INDEX invoices_client_idx ON public.invoices(client_id, created_at DESC);
CREATE INDEX invoice_lines_invoice_idx ON public.invoice_lines(invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_lines TO authenticated;
GRANT ALL ON public.invoice_lines TO service_role;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff and client contacts read invoices" ON public.invoices
FOR SELECT TO authenticated
USING (
  private.is_staff(auth.uid())
  OR (status <> 'draft' AND private.client_visible(auth.uid(), client_id))
);

CREATE POLICY "Contract authority manages invoices" ON public.invoices
FOR ALL TO authenticated
USING (private.can_manage_contracts(auth.uid()))
WITH CHECK (private.can_manage_contracts(auth.uid()));

CREATE POLICY "Staff and client contacts read invoice lines" ON public.invoice_lines
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.invoices i
  WHERE i.id = invoice_lines.invoice_id
    AND (
      private.is_staff(auth.uid())
      OR (i.status <> 'draft' AND private.client_visible(auth.uid(), i.client_id))
    )
));

CREATE POLICY "Contract authority manages invoice lines" ON public.invoice_lines
FOR ALL TO authenticated
USING (private.can_manage_contracts(auth.uid()))
WITH CHECK (private.can_manage_contracts(auth.uid()));

CREATE TRIGGER invoices_updated BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();