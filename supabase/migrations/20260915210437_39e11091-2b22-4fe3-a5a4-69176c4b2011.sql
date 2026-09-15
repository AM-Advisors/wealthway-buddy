CREATE TABLE public.cap_onboarding (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  company_legal_name text,
  entity_type text,
  state_formed text,
  date_formed date,
  authorized_shares numeric,
  par_value_cents bigint,
  fiscal_year_end text,
  signatory_name text,
  signatory_title text,
  signatory_email text,
  records_source text,
  acknowledged boolean not null default false,
  completed_at timestamptz,
  completed_by uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE ON public.cap_onboarding TO authenticated;
GRANT ALL ON public.cap_onboarding TO service_role;

ALTER TABLE public.cap_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client contacts read cap onboarding" ON public.cap_onboarding
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = cap_onboarding.client_id AND cu.user_id = auth.uid()));

CREATE POLICY "Client contacts write cap onboarding" ON public.cap_onboarding
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = cap_onboarding.client_id AND cu.user_id = auth.uid() AND cu.client_role <> 'client_readonly'));

CREATE POLICY "Client contacts update cap onboarding" ON public.cap_onboarding
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = cap_onboarding.client_id AND cu.user_id = auth.uid() AND cu.client_role <> 'client_readonly'));

CREATE POLICY "Staff read cap onboarding" ON public.cap_onboarding
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = ANY (ARRAY['admin','super_admin','legal','compliance','finance','client_success','executive','operations','fund_administration','tax']::app_role[])));

CREATE TRIGGER cap_onboarding_set_updated_at
BEFORE UPDATE ON public.cap_onboarding
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();