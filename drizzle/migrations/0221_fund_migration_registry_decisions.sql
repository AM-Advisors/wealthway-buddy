CREATE TABLE public.fund_migration_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_key text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approve_match','reject_match','confirm_duplicate','not_duplicate','confirm_archived','set_parent','not_a_fund','queue_for_import','needs_review')),
  offering_id uuid,
  parent_key text,
  reason text NOT NULL CHECK (length(reason) between 3 and 1000),
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_migration_decisions TO service_role;
ALTER TABLE public.fund_migration_decisions ENABLE ROW LEVEL SECURITY;
CREATE INDEX fund_migration_decisions_key_idx ON public.fund_migration_decisions (registry_key, created_at DESC);
CREATE OR REPLACE FUNCTION public.block_fund_migration_decision_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Fund migration decisions are append-only'; END $$;
CREATE TRIGGER fund_migration_decisions_append_only BEFORE UPDATE OR DELETE ON public.fund_migration_decisions
FOR EACH ROW EXECUTE FUNCTION public.block_fund_migration_decision_mutation();
COMMENT ON TABLE public.fund_migration_decisions IS 'Append-only staff review decisions for the Fund Migration registry. Never writes production funds.';