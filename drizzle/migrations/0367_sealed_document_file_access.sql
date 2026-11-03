CREATE OR REPLACE FUNCTION public.is_sealed_document_file(_bucket text, _path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT _bucket = 'offering-files' AND EXISTS (
 SELECT 1 FROM public.sealed_records s
 LEFT JOIN public.offering_document_versions v ON s.record_table = 'offering_document_versions' AND v.id = s.record_id
 LEFT JOIN public.document_template_versions t ON s.record_table = 'document_template_versions' AND t.id = s.record_id
 WHERE v.file_path = _path OR t.file_path = _path
 )
$$;
REVOKE ALL ON FUNCTION public.is_sealed_document_file(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_sealed_document_file(text,text) TO anon, authenticated, service_role;
CREATE POLICY "sealed document files hidden" ON storage.objects AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (NOT public.is_sealed_document_file(bucket_id,name));
CREATE POLICY "sealed template versions hidden" ON public.document_template_versions AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT public.is_sealed_record('document_template_versions',id));