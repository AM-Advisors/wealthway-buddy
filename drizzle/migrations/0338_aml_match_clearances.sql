CREATE TABLE public.account_aml_match_clearances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id uuid NOT NULL REFERENCES public.account_identity_checks(id),
  hit_key text NOT NULL,
  hit_caption text,
  reason text NOT NULL CHECK (length(btrim(reason)) >= 5),
  cleared_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (check_id, hit_key)
);
GRANT ALL ON public.account_aml_match_clearances TO service_role;
ALTER TABLE public.account_aml_match_clearances ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_aml_clearance_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Watchlist match clearances are permanent records'; END $$;
CREATE TRIGGER aml_clearance_append_only BEFORE UPDATE OR DELETE ON public.account_aml_match_clearances
FOR EACH ROW EXECUTE FUNCTION public.block_aml_clearance_mutation();