CREATE TABLE public.user_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL CHECK (url ~ '^/[^/]' OR url = '/') CHECK (length(url) <= 500),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  icon text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, url)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_favorites TO authenticated;
GRANT ALL ON public.user_favorites TO service_role;
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own favorites select" ON public.user_favorites FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own favorites insert" ON public.user_favorites FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND (SELECT count(*) FROM public.user_favorites f WHERE f.user_id = auth.uid()) < 25);
CREATE POLICY "Own favorites update" ON public.user_favorites FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own favorites delete" ON public.user_favorites FOR DELETE TO authenticated USING (user_id = auth.uid());