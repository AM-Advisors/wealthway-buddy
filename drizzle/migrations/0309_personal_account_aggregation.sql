CREATE TABLE public.personal_account_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  feed_kind text NOT NULL CHECK (feed_kind IN ('bank','brokerage')),
  provider_item_id text NOT NULL UNIQUE,
  access_token_ciphertext text NOT NULL,
  institution_name text,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','needs_reconnect','disconnected')),
  consent_version text NOT NULL,
  consented_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.personal_account_connections TO service_role;
ALTER TABLE public.personal_account_connections ENABLE ROW LEVEL SECURITY;
CREATE INDEX personal_account_connections_owner_idx ON public.personal_account_connections(owner_user_id, created_at DESC);

CREATE TABLE public.personal_account_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.personal_account_connections(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL,
  provider_account_id text NOT NULL,
  account_name text NOT NULL,
  account_mask text,
  account_type text NOT NULL,
  account_subtype text,
  currency text NOT NULL,
  current_balance_cents bigint,
  available_balance_cents bigint,
  holdings jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider_as_of timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (currency ~ '^[A-Z]{3}$'),
  CHECK (jsonb_typeof(holdings) = 'array')
);
GRANT SELECT ON public.personal_account_snapshots TO authenticated;
GRANT ALL ON public.personal_account_snapshots TO service_role;
ALTER TABLE public.personal_account_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY personal_account_snapshots_owner_read ON public.personal_account_snapshots FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE INDEX personal_account_snapshots_owner_idx ON public.personal_account_snapshots(owner_user_id, observed_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_personal_account_snapshot_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Account snapshots are permanent history';
END;
$$;
CREATE TRIGGER personal_account_snapshots_append_only
BEFORE UPDATE OR DELETE ON public.personal_account_snapshots
FOR EACH ROW EXECUTE FUNCTION public.prevent_personal_account_snapshot_change();

CREATE TABLE public.personal_account_connection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES public.personal_account_connections(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('consented','connected','refreshed','refresh_failed','reconnect_required','disconnected')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.personal_account_connection_events TO service_role;
ALTER TABLE public.personal_account_connection_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER personal_account_connection_events_append_only
BEFORE UPDATE OR DELETE ON public.personal_account_connection_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_personal_account_snapshot_change();