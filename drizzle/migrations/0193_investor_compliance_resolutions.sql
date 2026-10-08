CREATE TABLE public.investor_compliance_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL,
  position_id uuid NOT NULL,
  item_key text NOT NULL,
  method text NOT NULL CHECK (method IN ('test_manual_compliance_review','manual_compliance_review')),
  reason text NOT NULL CHECK (length(trim(reason)) >= 10),
  prepared_by uuid NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  CHECK (reviewed_by IS NULL OR reviewed_by <> prepared_by)
);
GRANT ALL ON public.investor_compliance_resolutions TO service_role;
ALTER TABLE public.investor_compliance_resolutions ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_compliance_resolution_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'compliance resolutions are append-only'; END IF;
  IF OLD.reviewed_by IS NOT NULL OR NEW.prepared_by <> OLD.prepared_by OR NEW.reason <> OLD.reason OR NEW.item_key <> OLD.item_key OR NEW.position_id <> OLD.position_id THEN
    RAISE EXCEPTION 'compliance resolutions cannot be rewritten';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_block_compliance_resolution_rewrite BEFORE UPDATE OR DELETE ON public.investor_compliance_resolutions FOR EACH ROW EXECUTE FUNCTION public.block_compliance_resolution_rewrite();
CREATE INDEX ON public.investor_compliance_resolutions (position_id, item_key);