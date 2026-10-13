CREATE TABLE public.source_reconciliation_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('harmonious','didit','simplici','wix','google_drive','box')),
  source_ref text NOT NULL CHECK (length(source_ref) between 1 and 200),
  decision text NOT NULL CHECK (decision IN ('confirm_match','reject_match','mark_unresolved','flag_duplicate','link_fund','request_evidence','stage_for_import')),
  proposed_person_id uuid,
  proposed_registry_key text,
  reason text NOT NULL CHECK (length(reason) between 3 and 1000),
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.source_reconciliation_decisions TO service_role;
ALTER TABLE public.source_reconciliation_decisions ENABLE ROW LEVEL SECURITY;
CREATE INDEX source_reconciliation_decisions_ref_idx ON public.source_reconciliation_decisions (source, source_ref, created_at DESC);
CREATE OR REPLACE FUNCTION public.block_source_reconciliation_decision_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Source reconciliation decisions are append-only'; END $$;
CREATE TRIGGER source_reconciliation_decisions_append_only BEFORE UPDATE OR DELETE ON public.source_reconciliation_decisions
FOR EACH ROW EXECUTE FUNCTION public.block_source_reconciliation_decision_mutation();
COMMENT ON TABLE public.source_reconciliation_decisions IS 'Append-only staff review decisions for cross-source reconciliation. Never modifies production people, investments or verification records.';