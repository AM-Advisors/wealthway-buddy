CREATE TABLE IF NOT EXISTS private.bank_links (
  offering_id uuid PRIMARY KEY REFERENCES public.offerings(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  access_token text NOT NULL,
  institution_name text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  institution_name text,
  account_name text,
  account_mask text,
  status text NOT NULL DEFAULT 'connected',
  last_synced_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_id, item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviewers view bank accounts" ON public.bank_accounts
  FOR SELECT TO authenticated USING (public.can_manage_diligence(offering_id));
CREATE POLICY "Reviewers add bank accounts" ON public.bank_accounts
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_diligence(offering_id) AND created_by = auth.uid());
CREATE POLICY "Reviewers update bank accounts" ON public.bank_accounts
  FOR UPDATE TO authenticated USING (public.can_manage_diligence(offering_id)) WITH CHECK (public.can_manage_diligence(offering_id));
CREATE POLICY "Reviewers remove bank accounts" ON public.bank_accounts
  FOR DELETE TO authenticated USING (public.can_manage_diligence(offering_id));

CREATE TRIGGER bank_accounts_updated BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  plaid_transaction_id text NOT NULL,
  posted_on date NOT NULL,
  amount_cents bigint NOT NULL,
  name text NOT NULL,
  description text,
  matched_application_id uuid REFERENCES public.investor_applications(id) ON DELETE SET NULL,
  matched_by uuid,
  matched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_id, plaid_transaction_id)
);

GRANT SELECT, INSERT, UPDATE ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviewers view bank transactions" ON public.bank_transactions
  FOR SELECT TO authenticated USING (public.can_manage_diligence(offering_id));
CREATE POLICY "Reviewers add bank transactions" ON public.bank_transactions
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_diligence(offering_id));
CREATE POLICY "Reviewers match bank transactions" ON public.bank_transactions
  FOR UPDATE TO authenticated USING (public.can_manage_diligence(offering_id)) WITH CHECK (public.can_manage_diligence(offering_id));

CREATE TRIGGER bank_transactions_updated BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX bank_transactions_offering_idx ON public.bank_transactions (offering_id, posted_on DESC);

CREATE OR REPLACE FUNCTION public.save_bank_link(p_offering_id uuid, p_item_id text, p_access_token text, p_institution text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_diligence(p_offering_id) THEN
    RAISE EXCEPTION 'Only administrators or assigned fund managers can connect a bank account';
  END IF;
  INSERT INTO private.bank_links (offering_id, item_id, access_token, institution_name, created_by, updated_at)
  VALUES (p_offering_id, p_item_id, p_access_token, p_institution, auth.uid(), now())
  ON CONFLICT (offering_id) DO UPDATE
    SET item_id = EXCLUDED.item_id,
        access_token = EXCLUDED.access_token,
        institution_name = EXCLUDED.institution_name,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_bank_access_token(p_offering_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_diligence(p_offering_id) THEN
    RAISE EXCEPTION 'Not authorized to use this bank connection';
  END IF;
  SELECT access_token INTO v_token FROM private.bank_links WHERE offering_id = p_offering_id;
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_bank_link(p_offering_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_diligence(p_offering_id) THEN
    RAISE EXCEPTION 'Not authorized to change this bank connection';
  END IF;
  DELETE FROM private.bank_links WHERE offering_id = p_offering_id;
END;
$$;