CREATE TABLE public.harmonious_standard_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_key text NOT NULL CHECK (form_key IN ('subscription_agreement','operating_agreement','ppm')),
  version int NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 20 AND 400000),
  note text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_key, version)
);
GRANT ALL ON public.harmonious_standard_forms TO service_role;
ALTER TABLE public.harmonious_standard_forms ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_standard_form_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Standard form versions are append-only'; END $$;
CREATE TRIGGER harmonious_standard_forms_immutable BEFORE UPDATE OR DELETE ON public.harmonious_standard_forms
FOR EACH ROW EXECUTE FUNCTION public.block_standard_form_mutation();
ALTER TABLE public.fund_files ADD COLUMN IF NOT EXISTS standard_form_id uuid REFERENCES public.harmonious_standard_forms(id);