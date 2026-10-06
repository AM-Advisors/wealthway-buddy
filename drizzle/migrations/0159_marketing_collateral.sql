CREATE TABLE public.marketing_collateral (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template text NOT NULL,
  title text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  author_id uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  export_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.marketing_collateral TO service_role;
ALTER TABLE public.marketing_collateral ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.marketing_collateral_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collateral_id uuid NOT NULL REFERENCES public.marketing_collateral(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_id uuid NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.marketing_collateral_events TO service_role;
ALTER TABLE public.marketing_collateral_events ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_collateral_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Collateral history is append-only'; END $$;
CREATE TRIGGER marketing_collateral_events_append_only BEFORE UPDATE OR DELETE ON public.marketing_collateral_events
FOR EACH ROW EXECUTE FUNCTION public.block_collateral_event_mutation();