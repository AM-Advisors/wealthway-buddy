CREATE TABLE public.marketing_brand_kit_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE,
  kit jsonb NOT NULL,
  note text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.marketing_brand_kit_versions TO service_role;
ALTER TABLE public.marketing_brand_kit_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.marketing_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  series_key text,
  format text NOT NULL,
  template_key text,
  source_kind text NOT NULL DEFAULT 'blank',
  source_item_id uuid,
  source_story_id uuid,
  source_template_design_id uuid,
  doc jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  designer_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.marketing_designs TO service_role;
ALTER TABLE public.marketing_designs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.marketing_design_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.marketing_designs(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  doc jsonb NOT NULL,
  change_kind text NOT NULL DEFAULT 'edit',
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (design_id, version)
);
GRANT ALL ON public.marketing_design_versions TO service_role;
ALTER TABLE public.marketing_design_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.marketing_design_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.marketing_designs(id) ON DELETE RESTRICT,
  action text NOT NULL,
  actor_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.marketing_design_events TO service_role;
ALTER TABLE public.marketing_design_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.marketing_design_append_only() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'append-only'; END $$;
CREATE TRIGGER bk_append_only BEFORE UPDATE OR DELETE ON public.marketing_brand_kit_versions FOR EACH ROW EXECUTE FUNCTION public.marketing_design_append_only();
CREATE TRIGGER dv_append_only BEFORE UPDATE OR DELETE ON public.marketing_design_versions FOR EACH ROW EXECUTE FUNCTION public.marketing_design_append_only();
CREATE TRIGGER de_append_only BEFORE UPDATE OR DELETE ON public.marketing_design_events FOR EACH ROW EXECUTE FUNCTION public.marketing_design_append_only();