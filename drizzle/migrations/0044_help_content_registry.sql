CREATE TABLE public.help_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  help_key text NOT NULL,
  title text NOT NULL,
  short_description text NOT NULL,
  long_description text,
  learn_more_url text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','retired')),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (help_key, version)
);
CREATE UNIQUE INDEX help_content_one_published ON public.help_content (help_key) WHERE status = 'published';
GRANT SELECT ON public.help_content TO anon, authenticated;
GRANT ALL ON public.help_content TO service_role;
ALTER TABLE public.help_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads published help" ON public.help_content FOR SELECT TO anon, authenticated USING (status = 'published');
CREATE POLICY "Staff read all help" ON public.help_content FOR SELECT TO authenticated USING (public.is_any_staff());
