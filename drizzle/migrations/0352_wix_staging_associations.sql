CREATE TABLE public.wix_staging_associations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('fund','investment')),
  wix_id text NOT NULL,
  offering_id uuid,
  wix_fund_id text,
  note text,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'fund' OR wix_fund_id IS NULL),
  CHECK (kind <> 'investment' OR offering_id IS NULL)
);
CREATE INDEX wix_staging_associations_lookup ON public.wix_staging_associations (kind, wix_id, created_at DESC);
GRANT SELECT ON public.wix_staging_associations TO authenticated;
GRANT ALL ON public.wix_staging_associations TO service_role;
ALTER TABLE public.wix_staging_associations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wix associations readable by staff" ON public.wix_staging_associations FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE OR REPLACE FUNCTION public.block_wix_association_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Wix associations are append-only; record a new association instead'; END $$;
CREATE TRIGGER wix_staging_associations_append_only BEFORE UPDATE OR DELETE ON public.wix_staging_associations FOR EACH ROW EXECUTE FUNCTION public.block_wix_association_mutation();