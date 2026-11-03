CREATE TABLE public.sealed_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_table text NOT NULL CHECK (record_table IN ('offering_document_versions','document_template_versions')),
  record_id uuid NOT NULL,
  label text NOT NULL,
  reason text NOT NULL,
  sealed_by uuid,
  sealed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_table, record_id)
);
GRANT ALL ON public.sealed_records TO service_role;
ALTER TABLE public.sealed_records ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sealed_record_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sealed_record_id uuid NOT NULL REFERENCES public.sealed_records(id),
  opened_by uuid NOT NULL,
  reason text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sealed_record_openings TO service_role;
ALTER TABLE public.sealed_record_openings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_sealed_record_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Sealed archive records cannot be changed or removed.'; END $$;
CREATE TRIGGER sealed_records_immutable BEFORE UPDATE OR DELETE ON public.sealed_records FOR EACH ROW EXECUTE FUNCTION public.block_sealed_record_mutation();
CREATE TRIGGER sealed_record_openings_immutable BEFORE UPDATE OR DELETE ON public.sealed_record_openings FOR EACH ROW EXECUTE FUNCTION public.block_sealed_record_mutation();

CREATE OR REPLACE FUNCTION public.is_sealed_record(_table text, _id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.sealed_records WHERE record_table = _table AND record_id = _id)
$$;
REVOKE ALL ON FUNCTION public.is_sealed_record(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_sealed_record(text, uuid) TO authenticated, service_role;

CREATE POLICY "sealed versions hidden" ON public.offering_document_versions AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT public.is_sealed_record('offering_document_versions', id));