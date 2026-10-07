CREATE TABLE public.classroom_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  category text NOT NULL DEFAULT 'private-markets',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','unpublished')),
  source text NOT NULL DEFAULT 'new' CHECK (source IN ('wix','new')),
  original_path text,
  author_name text,
  original_published_at timestamptz,
  current_version_id uuid,
  published_version_id uuid,
  published_at timestamptz,
  published_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.classroom_article_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.classroom_articles(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL,
  content_html text NOT NULL,
  hero_image_url text,
  hero_image_alt text,
  meta_title text,
  meta_description text,
  source text NOT NULL CHECK (source IN ('import','ai_refresh','ai_new','edit')),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, version)
);
CREATE TABLE public.classroom_article_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.classroom_articles(id) ON DELETE CASCADE,
  version_id uuid,
  action text NOT NULL,
  actor_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.classroom_articles, public.classroom_article_versions TO anon, authenticated;
GRANT ALL ON public.classroom_articles, public.classroom_article_versions, public.classroom_article_events TO service_role;
ALTER TABLE public.classroom_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_article_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_article_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published articles are public" ON public.classroom_articles FOR SELECT TO anon, authenticated USING (status = 'published');
CREATE POLICY "Published versions are public" ON public.classroom_article_versions FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.classroom_articles a WHERE a.published_version_id = classroom_article_versions.id AND a.status = 'published'));
CREATE OR REPLACE FUNCTION public.block_classroom_history_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Classroom versions and events are append-only'; END $$;
CREATE TRIGGER classroom_versions_append_only BEFORE UPDATE OR DELETE ON public.classroom_article_versions FOR EACH ROW EXECUTE FUNCTION public.block_classroom_history_mutation();
CREATE TRIGGER classroom_events_append_only BEFORE UPDATE OR DELETE ON public.classroom_article_events FOR EACH ROW EXECUTE FUNCTION public.block_classroom_history_mutation();