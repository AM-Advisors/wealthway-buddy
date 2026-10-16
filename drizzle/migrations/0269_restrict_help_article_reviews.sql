DROP POLICY IF EXISTS "Signed-in users read help approvals" ON public.help_article_reviews;
CREATE POLICY "Staff read help approvals" ON public.help_article_reviews
  FOR SELECT TO authenticated USING (
    private.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'operations'::public.app_role)
  );
CREATE OR REPLACE FUNCTION public.help_approved_versions()
RETURNS TABLE(slug text, version integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.slug, max(r.version)::integer FROM public.help_article_reviews r GROUP BY r.slug
$$;
REVOKE ALL ON FUNCTION public.help_approved_versions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.help_approved_versions() TO authenticated;