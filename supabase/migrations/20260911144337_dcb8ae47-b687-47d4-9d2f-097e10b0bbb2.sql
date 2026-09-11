CREATE TABLE public.capital_account_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.investor_applications(id) ON DELETE CASCADE,
  closing_id uuid REFERENCES public.application_closings(id) ON DELETE SET NULL,
  statement_date date NOT NULL DEFAULT current_date,
  period_end date,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  superseded boolean NOT NULL DEFAULT false,
  generated_by uuid,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX capital_account_statements_app_idx ON public.capital_account_statements (application_id, version DESC);
CREATE INDEX capital_account_statements_offering_idx ON public.capital_account_statements (offering_id);

GRANT SELECT, INSERT, UPDATE ON public.capital_account_statements TO authenticated;
GRANT ALL ON public.capital_account_statements TO service_role;

ALTER TABLE public.capital_account_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Investors read their own capital statements"
ON public.capital_account_statements FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.investor_applications a
  WHERE a.id = capital_account_statements.application_id AND a.user_id = auth.uid()
));

CREATE POLICY "Fund staff read capital statements"
ON public.capital_account_statements FOR SELECT TO authenticated
USING (public.can_manage_diligence(offering_id));

CREATE POLICY "Fund staff create capital statements"
ON public.capital_account_statements FOR INSERT TO authenticated
WITH CHECK (public.can_manage_diligence(offering_id));

CREATE POLICY "Fund staff update capital statements"
ON public.capital_account_statements FOR UPDATE TO authenticated
USING (public.can_manage_diligence(offering_id))
WITH CHECK (public.can_manage_diligence(offering_id));

CREATE TRIGGER capital_account_statements_updated_at
BEFORE UPDATE ON public.capital_account_statements
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();