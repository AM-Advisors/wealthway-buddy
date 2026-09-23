-- Agreement preparation: reusable Box Sign field layouts (signing templates),
-- versioned so an outstanding signature request is never silently changed.

CREATE TABLE public.signing_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('harmonious','fund','company')),
  offering_id uuid REFERENCES public.offerings(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  agreement_type text NOT NULL DEFAULT 'other',
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  current_version integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signing_templates_scope_target CHECK (
    (scope = 'harmonious' AND offering_id IS NULL AND company_id IS NULL)
    OR (scope = 'fund' AND offering_id IS NOT NULL AND company_id IS NULL)
    OR (scope = 'company' AND company_id IS NOT NULL AND offering_id IS NULL)
  )
);

CREATE INDEX signing_templates_offering_idx ON public.signing_templates (offering_id);
CREATE INDEX signing_templates_company_idx ON public.signing_templates (company_id);

GRANT SELECT, INSERT, UPDATE ON public.signing_templates TO authenticated;
GRANT ALL ON public.signing_templates TO service_role;
ALTER TABLE public.signing_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff manage signing templates"
  ON public.signing_templates FOR ALL TO authenticated
  USING (public.is_any_staff())
  WITH CHECK (public.is_any_staff());

CREATE POLICY "fund managers read their fund templates"
  ON public.signing_templates FOR SELECT TO authenticated
  USING (
    scope = 'harmonious'
    OR (scope = 'fund' AND EXISTS (
      SELECT 1 FROM public.fund_managers fm
      WHERE fm.offering_id = signing_templates.offering_id AND fm.user_id = auth.uid()
    ))
    OR (scope = 'company' AND EXISTS (
      SELECT 1 FROM public.ct_companies c WHERE c.id = signing_templates.company_id
    ))
  );

CREATE POLICY "fund managers write their fund templates"
  ON public.signing_templates FOR INSERT TO authenticated
  WITH CHECK (
    (scope = 'fund' AND EXISTS (
      SELECT 1 FROM public.fund_managers fm
      WHERE fm.offering_id = signing_templates.offering_id AND fm.user_id = auth.uid()
    ))
    OR (scope = 'company' AND EXISTS (
      SELECT 1 FROM public.ct_companies c WHERE c.id = signing_templates.company_id
    ))
  );

CREATE POLICY "fund managers update their fund templates"
  ON public.signing_templates FOR UPDATE TO authenticated
  USING (
    (scope = 'fund' AND EXISTS (
      SELECT 1 FROM public.fund_managers fm
      WHERE fm.offering_id = signing_templates.offering_id AND fm.user_id = auth.uid()
    ))
    OR (scope = 'company' AND EXISTS (
      SELECT 1 FROM public.ct_companies c WHERE c.id = signing_templates.company_id
    ))
  )
  WITH CHECK (
    (scope = 'fund' AND EXISTS (
      SELECT 1 FROM public.fund_managers fm
      WHERE fm.offering_id = signing_templates.offering_id AND fm.user_id = auth.uid()
    ))
    OR (scope = 'company' AND EXISTS (
      SELECT 1 FROM public.ct_companies c WHERE c.id = signing_templates.company_id
    ))
  );

-- Every saved field layout is a version. Published versions never change.
CREATE TABLE public.signing_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.signing_templates(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','superseded')),
  roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  offering_document_id uuid REFERENCES public.offering_documents(id) ON DELETE SET NULL,
  source_box_file_id text,
  source_box_file_version_id text,
  notes text,
  prepared_by uuid NOT NULL,
  published_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_no)
);

CREATE INDEX signing_template_versions_template_idx
  ON public.signing_template_versions (template_id, version_no DESC);

GRANT SELECT, INSERT, UPDATE ON public.signing_template_versions TO authenticated;
GRANT ALL ON public.signing_template_versions TO service_role;
ALTER TABLE public.signing_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff manage template versions"
  ON public.signing_template_versions FOR ALL TO authenticated
  USING (public.is_any_staff())
  WITH CHECK (public.is_any_staff());

CREATE POLICY "template owners read versions"
  ON public.signing_template_versions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.signing_templates t WHERE t.id = signing_template_versions.template_id));

CREATE POLICY "template owners add versions"
  ON public.signing_template_versions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.signing_templates t
    WHERE t.id = signing_template_versions.template_id
      AND ((t.scope = 'fund' AND EXISTS (
            SELECT 1 FROM public.fund_managers fm
            WHERE fm.offering_id = t.offering_id AND fm.user_id = auth.uid()))
        OR (t.scope = 'company' AND EXISTS (
            SELECT 1 FROM public.ct_companies c WHERE c.id = t.company_id)))
  ));

CREATE POLICY "template owners update draft versions"
  ON public.signing_template_versions FOR UPDATE TO authenticated
  USING (status = 'draft' AND EXISTS (
    SELECT 1 FROM public.signing_templates t
    WHERE t.id = signing_template_versions.template_id
      AND ((t.scope = 'fund' AND EXISTS (
            SELECT 1 FROM public.fund_managers fm
            WHERE fm.offering_id = t.offering_id AND fm.user_id = auth.uid()))
        OR (t.scope = 'company' AND EXISTS (
            SELECT 1 FROM public.ct_companies c WHERE c.id = t.company_id)))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.signing_templates t
    WHERE t.id = signing_template_versions.template_id
  ));

-- A published layout is frozen: only retirement (superseded) may change.
CREATE OR REPLACE FUNCTION public.protect_published_template_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'published' THEN
    IF NEW.roles IS DISTINCT FROM OLD.roles
       OR NEW.fields IS DISTINCT FROM OLD.fields
       OR NEW.source_box_file_id IS DISTINCT FROM OLD.source_box_file_id
       OR NEW.source_box_file_version_id IS DISTINCT FROM OLD.source_box_file_version_id
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.template_id IS DISTINCT FROM OLD.template_id THEN
      RAISE EXCEPTION 'A published signing template version cannot be changed. Create a new version instead.';
    END IF;
    IF NEW.status NOT IN ('published','superseded') THEN
      RAISE EXCEPTION 'A published signing template version cannot return to draft.';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_published_template_version
  BEFORE UPDATE ON public.signing_template_versions
  FOR EACH ROW EXECUTE FUNCTION public.protect_published_template_version();

-- Preparation provenance on the authoritative signature record.
ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS template_version_id uuid REFERENCES public.signing_template_versions(id),
  ADD COLUMN IF NOT EXISTS document_author uuid,
  ADD COLUMN IF NOT EXISTS prepared_by uuid,
  ADD COLUMN IF NOT EXISTS prepared_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_by uuid,
  ADD COLUMN IF NOT EXISTS placed_fields jsonb;

ALTER TABLE public.document_signature_signers
  ADD COLUMN IF NOT EXISTS role_key text;

COMMENT ON COLUMN public.document_signatures.placed_fields IS
  'The exact Box Sign field layout sent with this request. Frozen once sent.';