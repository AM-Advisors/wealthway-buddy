ALTER TYPE public.journal_source ADD VALUE IF NOT EXISTS 'quickbooks';

CREATE OR REPLACE FUNCTION public.block_phase5_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'This accounting record is permanent and cannot be changed or deleted (%).', TG_TABLE_NAME;
END $$;

CREATE TABLE public.qbo_company_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  realm_id text,
  company_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('linked','unlinked')),
  mode text NOT NULL DEFAULT 'file' CHECK (mode IN ('file','live')),
  note text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.qbo_account_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  qbo_account_name text NOT NULL,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.qbo_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound','drift')),
  source text NOT NULL CHECK (source IN ('file','live')),
  file_name text,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.qbo_inbound_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.qbo_sync_runs(id) ON DELETE CASCADE,
  qbo_txn_id text NOT NULL,
  txn_date date,
  memo text,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_cents bigint NOT NULL DEFAULT 0,
  outcome text NOT NULL CHECK (outcome IN ('drafted','skipped_duplicate','skipped_ours','needs_mapping','unbalanced','closed_period')),
  journal_entry_id uuid REFERENCES public.journal_entries(id),
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX qbo_inbound_items_drafted_once ON public.qbo_inbound_items(offering_id, qbo_txn_id) WHERE outcome = 'drafted';
CREATE TABLE public.qbo_outbound_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  entry_ids uuid[] NOT NULL,
  note text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.qbo_outbound_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL UNIQUE REFERENCES public.qbo_outbound_batches(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('approved','declined')),
  reason text,
  decided_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.qbo_outbound_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.qbo_outbound_batches(id) ON DELETE CASCADE,
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id),
  outcome text NOT NULL CHECK (outcome IN ('exported','sent','failed','already_in_qbo')),
  qbo_txn_id text,
  detail text,
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX qbo_outbound_items_once ON public.qbo_outbound_items(journal_entry_id) WHERE outcome IN ('sent','already_in_qbo');
CREATE TABLE public.qbo_drift_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  as_of date NOT NULL,
  rows jsonb NOT NULL,
  max_diff_cents bigint NOT NULL DEFAULT 0,
  explanation text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bank_balance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  bank_account_id uuid REFERENCES public.bank_accounts(id),
  as_of date NOT NULL,
  balance_cents bigint NOT NULL,
  source text NOT NULL CHECK (source IN ('plaid','manual')),
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bank_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('unmatched_deposit','balance_mismatch','feed_stale','unexpected_withdrawal')),
  dedupe_key text NOT NULL UNIQUE,
  bank_transaction_id uuid REFERENCES public.bank_transactions(id),
  bank_account_id uuid REFERENCES public.bank_accounts(id),
  amount_cents bigint,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bank_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.bank_alerts(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('acknowledged','assigned','resolved','reopened')),
  assignee_user_id uuid,
  note text,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.close_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('investor_closing','month_end')),
  sheet_key text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_id, kind, sheet_key)
);
CREATE TABLE public.close_sheet_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id uuid NOT NULL REFERENCES public.close_sheets(id) ON DELETE CASCADE,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  approval_deadline date,
  note text,
  prepared_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sheet_id, version)
);
CREATE TABLE public.close_sheet_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL UNIQUE REFERENCES public.close_sheet_versions(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('approved','returned')),
  reason text,
  decided_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['qbo_company_links','qbo_account_mappings','qbo_sync_runs','qbo_inbound_items','qbo_outbound_batches','qbo_outbound_decisions','qbo_outbound_items','qbo_drift_snapshots','bank_balance_snapshots','bank_alerts','bank_alert_events','close_sheets','close_sheet_versions','close_sheet_decisions'] LOOP
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION public.block_phase5_mutation()', t || '_immutable', t);
  END LOOP;
END $$;

CREATE INDEX bank_alerts_offering_idx ON public.bank_alerts(offering_id, detected_at DESC);
CREATE INDEX bank_alert_events_alert_idx ON public.bank_alert_events(alert_id, created_at);
CREATE INDEX qbo_inbound_items_offering_idx ON public.qbo_inbound_items(offering_id, created_at DESC);
CREATE INDEX close_sheet_versions_sheet_idx ON public.close_sheet_versions(sheet_id, version DESC);