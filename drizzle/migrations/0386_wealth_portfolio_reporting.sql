ALTER TABLE public.personal_wealth_observations
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS import_row_hash text,
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS geography text,
  ADD COLUMN IF NOT EXISTS holder_entity_id uuid,
  ADD COLUMN IF NOT EXISTS represents_entity_id uuid;
ALTER TABLE public.personal_wealth_observations
  ADD CONSTRAINT personal_wealth_observations_source_check CHECK (source IN ('manual','import'));
COMMENT ON COLUMN public.personal_wealth_observations.holder_entity_id IS 'record_id of the wealth_portfolio_records entity that holds this asset; null = held directly by the owner.';
COMMENT ON COLUMN public.personal_wealth_observations.represents_entity_id IS 'When set, this holding is the owner''s interest in an entity already counted through look-through; excluded from totals to prevent double counting.';

CREATE TABLE public.wealth_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('holdings','private_cash_flows')),
  file_name text NOT NULL,
  file_sha256 text NOT NULL,
  row_count integer NOT NULL,
  imported_count integer NOT NULL,
  skipped_duplicates integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wealth_import_batches_owner_hash_idx ON public.wealth_import_batches (owner_user_id, file_sha256);
GRANT SELECT, INSERT ON public.wealth_import_batches TO authenticated;
GRANT ALL ON public.wealth_import_batches TO service_role;
ALTER TABLE public.wealth_import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY wealth_import_batches_owner_read ON public.wealth_import_batches FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE POLICY wealth_import_batches_owner_insert ON public.wealth_import_batches FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid() AND created_by = auth.uid());

CREATE TABLE public.wealth_portfolio_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL,
  supersedes_id uuid UNIQUE REFERENCES public.wealth_portfolio_records(id),
  owner_user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('entity','ownership','commitment','cash_flow')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import')),
  import_batch_id uuid REFERENCES public.wealth_import_batches(id),
  import_row_hash text,
  archived boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wealth_portfolio_records_owner_idx ON public.wealth_portfolio_records (owner_user_id, kind);
GRANT SELECT, INSERT ON public.wealth_portfolio_records TO authenticated;
GRANT ALL ON public.wealth_portfolio_records TO service_role;
ALTER TABLE public.wealth_portfolio_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY wealth_portfolio_records_owner_read ON public.wealth_portfolio_records FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE POLICY wealth_portfolio_records_owner_insert ON public.wealth_portfolio_records FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid() AND created_by = auth.uid());

CREATE TABLE public.wealth_report_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  period_label text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  snapshot_sha256 text NOT NULL,
  supersedes_id uuid UNIQUE REFERENCES public.wealth_report_versions(id),
  published_by uuid NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, period_end, version)
);
GRANT SELECT, INSERT ON public.wealth_report_versions TO authenticated;
GRANT ALL ON public.wealth_report_versions TO service_role;
ALTER TABLE public.wealth_report_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY wealth_report_versions_owner_read ON public.wealth_report_versions FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE POLICY wealth_report_versions_owner_insert ON public.wealth_report_versions FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid() AND published_by = auth.uid());

CREATE TABLE public.wealth_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  record_ref text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wealth_audit_events_owner_idx ON public.wealth_audit_events (owner_user_id, created_at DESC);
GRANT SELECT, INSERT ON public.wealth_audit_events TO authenticated;
GRANT ALL ON public.wealth_audit_events TO service_role;
ALTER TABLE public.wealth_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY wealth_audit_events_owner_read ON public.wealth_audit_events FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE POLICY wealth_audit_events_actor_insert ON public.wealth_audit_events FOR INSERT TO authenticated WITH CHECK (actor_user_id = auth.uid() AND owner_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.block_wealth_history_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Portfolio history is append-only; record a correction instead.';
END;
$$;
CREATE TRIGGER wealth_import_batches_append_only BEFORE UPDATE OR DELETE ON public.wealth_import_batches FOR EACH ROW EXECUTE FUNCTION public.block_wealth_history_mutation();
CREATE TRIGGER wealth_portfolio_records_append_only BEFORE UPDATE OR DELETE ON public.wealth_portfolio_records FOR EACH ROW EXECUTE FUNCTION public.block_wealth_history_mutation();
CREATE TRIGGER wealth_report_versions_append_only BEFORE UPDATE OR DELETE ON public.wealth_report_versions FOR EACH ROW EXECUTE FUNCTION public.block_wealth_history_mutation();
CREATE TRIGGER wealth_audit_events_append_only BEFORE UPDATE OR DELETE ON public.wealth_audit_events FOR EACH ROW EXECUTE FUNCTION public.block_wealth_history_mutation();