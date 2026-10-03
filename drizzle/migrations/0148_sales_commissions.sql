CREATE TABLE public.commission_rate_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rates jsonb NOT NULL,
  reason text NOT NULL,
  set_by uuid NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.commission_rate_versions TO service_role;
ALTER TABLE public.commission_rate_versions ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_commission_rate_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'commission rate history is append-only'; END $$;
CREATE TRIGGER commission_rate_versions_append_only BEFORE UPDATE OR DELETE ON public.commission_rate_versions
  FOR EACH ROW EXECUTE FUNCTION public.block_commission_rate_mutation();
ALTER TABLE public.sales_quotes ADD COLUMN IF NOT EXISTS bdr_user_id uuid;