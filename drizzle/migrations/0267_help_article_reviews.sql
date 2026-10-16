CREATE TABLE public.help_article_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  version integer NOT NULL,
  approved_by uuid NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, version)
);
GRANT SELECT, INSERT ON public.help_article_reviews TO authenticated;
GRANT ALL ON public.help_article_reviews TO service_role;
ALTER TABLE public.help_article_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read help approvals" ON public.help_article_reviews
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leads approve help articles" ON public.help_article_reviews
  FOR INSERT TO authenticated WITH CHECK (
    approved_by = auth.uid() AND (
      private.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR private.has_role(auth.uid(), 'admin'::public.app_role)
      OR private.has_role(auth.uid(), 'operations'::public.app_role)
    )
  );