CREATE TABLE public.wix_fund_staging (
  wix_id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.wix_investment_staging (
  wix_id text PRIMARY KEY,
  wix_fund_id text,
  full_name text NOT NULL DEFAULT '',
  entity_name text,
  email text,
  committed_cents bigint NOT NULL DEFAULT 0,
  received_cents bigint NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wix_fund_staging TO authenticated;
GRANT SELECT ON public.wix_investment_staging TO authenticated;
GRANT ALL ON public.wix_fund_staging TO service_role;
GRANT ALL ON public.wix_investment_staging TO service_role;
ALTER TABLE public.wix_fund_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wix_investment_staging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wix funds readable by staff" ON public.wix_fund_staging FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "wix investments readable by staff" ON public.wix_investment_staging FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));