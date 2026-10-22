CREATE TABLE public.payment_plan_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL,
 scope text NOT NULL CHECK (scope IN ('invoices','fund_invoices','client_payments','commissions')),
 cadence text NOT NULL CHECK (cadence IN ('quarterly','annual')),
 first_due_on date NOT NULL,
 items jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.payment_plan_versions TO service_role;
ALTER TABLE public.payment_plan_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_plan_service_only ON public.payment_plan_versions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE FUNCTION public.block_payment_plan_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN RAISE EXCEPTION 'Payment schedule versions are permanent.'; END $$;
CREATE TRIGGER payment_plan_immutable BEFORE UPDATE OR DELETE ON public.payment_plan_versions FOR EACH ROW EXECUTE FUNCTION public.block_payment_plan_mutation();