ALTER TABLE public.cap_holdings
  ADD COLUMN IF NOT EXISTS parent_holding_id uuid REFERENCES public.cap_holdings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transfer_id uuid REFERENCES public.cap_transfers(id) ON DELETE SET NULL;

CREATE TABLE public.cap_holder_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  stakeholder_id uuid NOT NULL REFERENCES public.cap_stakeholders(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('login','link')),
  email text,
  user_id uuid,
  token_hash text UNIQUE,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cap_holder_access TO authenticated;
GRANT ALL ON public.cap_holder_access TO service_role;
ALTER TABLE public.cap_holder_access ENABLE ROW LEVEL SECURITY;

CREATE INDEX cap_holder_access_client_idx ON public.cap_holder_access (client_id);
CREATE INDEX cap_holder_access_stakeholder_idx ON public.cap_holder_access (stakeholder_id);
CREATE INDEX cap_holder_access_user_idx ON public.cap_holder_access (user_id);

CREATE TABLE public.cap_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  holding_id uuid NOT NULL REFERENCES public.cap_holdings(id) ON DELETE CASCADE,
  stakeholder_id uuid NOT NULL REFERENCES public.cap_stakeholders(id) ON DELETE CASCADE,
  certificate_no text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','cancelled','replaced')),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_code text NOT NULL,
  file_path text,
  file_name text,
  uploaded_at timestamptz,
  signer_name text,
  signer_title text,
  signed_at timestamptz,
  signed_by uuid,
  signature_ip text,
  signature_user_agent text,
  cancelled_at timestamptz,
  cancelled_reason text,
  replaced_by uuid REFERENCES public.cap_certificates(id) ON DELETE SET NULL,
  transfer_id uuid REFERENCES public.cap_transfers(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cap_certificates TO authenticated;
GRANT ALL ON public.cap_certificates TO service_role;
ALTER TABLE public.cap_certificates ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX cap_certificates_no_unique ON public.cap_certificates (client_id, certificate_no);
CREATE UNIQUE INDEX cap_certificates_code_unique ON public.cap_certificates (verification_code);
CREATE INDEX cap_certificates_holding_idx ON public.cap_certificates (holding_id);
CREATE INDEX cap_certificates_stakeholder_idx ON public.cap_certificates (stakeholder_id);

CREATE TRIGGER cap_certificates_updated_at BEFORE UPDATE ON public.cap_certificates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER cap_holder_access_updated_at BEFORE UPDATE ON public.cap_holder_access
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper: does the signed-in user hold live shareholder access to this stakeholder?
CREATE OR REPLACE FUNCTION public.cap_holder_can_view(_stakeholder_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.cap_holder_access a
    WHERE a.stakeholder_id = _stakeholder_id
      AND a.kind = 'login'
      AND a.user_id = auth.uid()
      AND a.revoked_at IS NULL
      AND (a.expires_at IS NULL OR a.expires_at > now())
  )
$$;

-- cap_holder_access policies
CREATE POLICY "Client contacts read holder access" ON public.cap_holder_access
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = cap_holder_access.client_id AND cu.user_id = auth.uid()));

CREATE POLICY "Client contacts create holder access" ON public.cap_holder_access
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = cap_holder_access.client_id AND cu.user_id = auth.uid() AND cu.client_role <> 'client_readonly'));

CREATE POLICY "Client contacts update holder access" ON public.cap_holder_access
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = cap_holder_access.client_id AND cu.user_id = auth.uid() AND cu.client_role <> 'client_readonly'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = cap_holder_access.client_id AND cu.user_id = auth.uid() AND cu.client_role <> 'client_readonly'));

CREATE POLICY "Staff read holder access" ON public.cap_holder_access
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = ANY (ARRAY['admin','super_admin','legal','compliance','finance','client_success','executive','operations','fund_administration','tax']::public.app_role[])));

CREATE POLICY "Holders read their own access" ON public.cap_holder_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- cap_certificates policies
CREATE POLICY "Client contacts read certificates" ON public.cap_certificates
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = cap_certificates.client_id AND cu.user_id = auth.uid()));

CREATE POLICY "Client contacts create certificates" ON public.cap_certificates
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = cap_certificates.client_id AND cu.user_id = auth.uid() AND cu.client_role <> 'client_readonly'));

CREATE POLICY "Client contacts update certificates" ON public.cap_certificates
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = cap_certificates.client_id AND cu.user_id = auth.uid() AND cu.client_role <> 'client_readonly'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = cap_certificates.client_id AND cu.user_id = auth.uid() AND cu.client_role <> 'client_readonly'));

CREATE POLICY "Staff read certificates" ON public.cap_certificates
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = ANY (ARRAY['admin','super_admin','legal','compliance','finance','client_success','executive','operations','fund_administration','tax']::public.app_role[])));

CREATE POLICY "Holders read their own certificates" ON public.cap_certificates
  FOR SELECT TO authenticated
  USING (public.cap_holder_can_view(stakeholder_id));

-- Shareholders with a portal login may read their own shares and stakeholder row
CREATE POLICY "Holders read their own holdings" ON public.cap_holdings
  FOR SELECT TO authenticated
  USING (public.cap_holder_can_view(stakeholder_id));

CREATE POLICY "Holders read their own stakeholder row" ON public.cap_stakeholders
  FOR SELECT TO authenticated
  USING (public.cap_holder_can_view(id));