CREATE TABLE public.portfolio_opening_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL,
  book_id uuid NOT NULL,
  batch_ref text NOT NULL,
  source_system text NOT NULL,
  source_reference text NOT NULL,
  as_of_date date NOT NULL,
  issuer_name text NOT NULL,
  asset_name text NOT NULL,
  asset_class public.portfolio_asset_class NOT NULL,
  cost_basis_cents bigint NOT NULL CHECK (cost_basis_cents >= 0),
  opening_fair_value_cents bigint NOT NULL CHECK (opening_fair_value_cents >= 0),
  evidence_status text NOT NULL CHECK (evidence_status IN ('present','missing_in_source','review_required')),
  opening_journal_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','approved','rejected')),
  asset_id uuid UNIQUE,
  opening_valuation_id uuid UNIQUE,
  prepared_by uuid NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  CHECK (decided_by IS NULL OR decided_by <> prepared_by)
);
CREATE UNIQUE INDEX portfolio_opening_positions_one_live ON public.portfolio_opening_positions (offering_id, lower(issuer_name), lower(asset_name)) WHERE status <> 'rejected';
GRANT ALL ON public.portfolio_opening_positions TO service_role;
ALTER TABLE public.portfolio_opening_positions ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_opening_position_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'opening positions are never deleted'; END IF;
  IF OLD.status <> 'prepared' THEN RAISE EXCEPTION 'decided opening positions are immutable; correct through a new record'; END IF;
  IF NEW.cost_basis_cents <> OLD.cost_basis_cents OR NEW.opening_fair_value_cents <> OLD.opening_fair_value_cents
     OR NEW.offering_id <> OLD.offering_id OR NEW.prepared_by <> OLD.prepared_by OR NEW.evidence_status <> OLD.evidence_status THEN
    RAISE EXCEPTION 'opening position source facts are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_block_opening_position_rewrite BEFORE UPDATE OR DELETE ON public.portfolio_opening_positions FOR EACH ROW EXECUTE FUNCTION public.block_opening_position_rewrite();