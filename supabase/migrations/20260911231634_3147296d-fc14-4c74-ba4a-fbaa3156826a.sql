CREATE TABLE public.client_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label text,
  institution_name text NOT NULL,
  account_holder text NOT NULL,
  account_type text NOT NULL DEFAULT 'checking',
  account_last4 text,
  routing_last4 text,
  reference_hint text,
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_bank_accounts TO authenticated;
GRANT ALL ON public.client_bank_accounts TO service_role;

ALTER TABLE public.client_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance staff manage client bank accounts"
ON public.client_bank_accounts
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin','super_admin','operations','fund_administration','finance')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin','super_admin','operations','fund_administration','finance')
  )
);

CREATE POLICY "Staff and the client can view their bank accounts"
ON public.client_bank_accounts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('legal','compliance','client_success','executive','tax')
  )
  OR EXISTS (
    SELECT 1 FROM public.client_users cu
    WHERE cu.client_id = client_bank_accounts.client_id
      AND cu.user_id = auth.uid()
  )
);

CREATE INDEX client_bank_accounts_client_idx ON public.client_bank_accounts(client_id);
CREATE UNIQUE INDEX client_bank_accounts_primary_idx
  ON public.client_bank_accounts(client_id) WHERE is_primary;

CREATE TRIGGER client_bank_accounts_set_updated_at
BEFORE UPDATE ON public.client_bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();