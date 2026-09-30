CREATE TABLE public.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  description text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE TABLE public.document_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.document_templates(id),
  version integer NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size_bytes bigint,
  source_offering_id uuid REFERENCES public.offerings(id),
  source_document_id uuid REFERENCES public.offering_documents(id),
  source_version integer,
  change_note text,
  status text NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval','approved','rejected')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  UNIQUE (template_id, version)
);
CREATE TABLE public.document_template_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.document_templates(id),
  template_version integer NOT NULL,
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  offering_document_id uuid NOT NULL REFERENCES public.offering_documents(id),
  fund_version integer NOT NULL,
  used_by uuid NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.document_templates, public.document_template_versions, public.document_template_uses TO service_role;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_template_uses ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.protect_template_version() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'template versions are never deleted'; END IF;
  IF OLD.status <> 'pending_approval' THEN RAISE EXCEPTION 'a decided template version cannot change'; END IF;
  IF NEW.file_path <> OLD.file_path OR NEW.version <> OLD.version OR NEW.template_id <> OLD.template_id OR NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'only the approval decision can be recorded on a template version';
  END IF;
  IF NEW.decided_by IS NOT NULL AND NEW.decided_by = OLD.created_by THEN
    RAISE EXCEPTION 'a different person must approve a template version';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER document_template_versions_protect BEFORE UPDATE OR DELETE ON public.document_template_versions
FOR EACH ROW EXECUTE FUNCTION public.protect_template_version();

CREATE OR REPLACE FUNCTION public.block_template_use_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'document_template_uses is append-only'; END $$;
CREATE TRIGGER document_template_uses_append_only BEFORE UPDATE OR DELETE ON public.document_template_uses
FOR EACH ROW EXECUTE FUNCTION public.block_template_use_mutation();