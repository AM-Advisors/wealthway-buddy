CREATE TABLE public.plaid_link_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fund_id uuid,
  policy_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  user_agent text
);
GRANT SELECT, INSERT ON public.plaid_link_consents TO authenticated;
GRANT ALL ON public.plaid_link_consents TO service_role;
ALTER TABLE public.plaid_link_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own plaid consents" ON public.plaid_link_consents FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users record own plaid consents" ON public.plaid_link_consents FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE INDEX plaid_link_consents_user_idx ON public.plaid_link_consents(user_id, accepted_at DESC);