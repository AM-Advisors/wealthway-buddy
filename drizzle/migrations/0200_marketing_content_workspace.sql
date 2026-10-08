CREATE TABLE public.marketing_content_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.marketing_content_items(id),
  version int NOT NULL,
  package jsonb NOT NULL,
  ai_generated boolean NOT NULL DEFAULT false,
  model text,
  note text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(item_id, version)
);
GRANT ALL ON public.marketing_content_packages TO service_role;
ALTER TABLE public.marketing_content_packages ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER mcp_append_only BEFORE UPDATE OR DELETE ON public.marketing_content_packages FOR EACH ROW EXECUTE FUNCTION public.block_marketing_studio_history_mutation();

CREATE TABLE public.marketing_content_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.marketing_content_items(id),
  package_version int NOT NULL,
  kind text NOT NULL CHECK (kind IN ('source_verification','fact_check','compliance','originality','founder_review')),
  result text NOT NULL CHECK (result IN ('pass','fail')),
  note text,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.marketing_content_reviews TO service_role;
ALTER TABLE public.marketing_content_reviews ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER mcr_append_only BEFORE UPDATE OR DELETE ON public.marketing_content_reviews FOR EACH ROW EXECUTE FUNCTION public.block_marketing_studio_history_mutation();

ALTER TABLE public.marketing_content_items ADD COLUMN IF NOT EXISTS package_version int NOT NULL DEFAULT 0;
ALTER TABLE public.marketing_content_items ADD COLUMN IF NOT EXISTS post_ids uuid[] NOT NULL DEFAULT '{}';