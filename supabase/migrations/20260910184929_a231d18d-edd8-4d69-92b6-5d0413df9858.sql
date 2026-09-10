ALTER TABLE public.third_party_providers ADD COLUMN IF NOT EXISTS retired_at timestamptz;

CREATE TABLE public.pass_through_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  provider_id uuid REFERENCES public.third_party_providers(id) ON DELETE SET NULL,
  pricing_item_id uuid REFERENCES public.pricing_items(id) ON DELETE SET NULL,
  description text NOT NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  incurred_on date NOT NULL DEFAULT current_date,
  reference text,
  note text,
  billing_status text NOT NULL DEFAULT 'unbilled',
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pass_through_expenses TO authenticated;
GRANT ALL ON public.pass_through_expenses TO service_role;

ALTER TABLE public.pass_through_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses readable by staff"
ON public.pass_through_expenses FOR SELECT TO authenticated
USING (private.is_staff(auth.uid()));

CREATE POLICY "expenses managed by contract authority"
ON public.pass_through_expenses FOR ALL TO authenticated
USING (private.can_manage_contracts(auth.uid()))
WITH CHECK (private.can_manage_contracts(auth.uid()));

CREATE INDEX idx_pass_through_expenses_offering ON public.pass_through_expenses(offering_id);
CREATE INDEX idx_pass_through_expenses_provider ON public.pass_through_expenses(provider_id);
CREATE INDEX idx_pass_through_expenses_incurred ON public.pass_through_expenses(incurred_on DESC);

CREATE TRIGGER set_pass_through_expenses_updated_at
BEFORE UPDATE ON public.pass_through_expenses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();