CREATE TABLE public.sales_controlled_texts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text_key text NOT NULL,
  version integer NOT NULL,
  body text NOT NULL CHECK (length(btrim(body)) >= 20),
  reason text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (text_key, version)
);
GRANT ALL ON public.sales_controlled_texts TO service_role;
ALTER TABLE public.sales_controlled_texts ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.sales_controlled_texts_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Controlled wording versions cannot be changed or deleted; add a new version.'; END $$;
CREATE TRIGGER sales_controlled_texts_no_change BEFORE UPDATE OR DELETE ON public.sales_controlled_texts
  FOR EACH ROW EXECUTE FUNCTION public.sales_controlled_texts_immutable();