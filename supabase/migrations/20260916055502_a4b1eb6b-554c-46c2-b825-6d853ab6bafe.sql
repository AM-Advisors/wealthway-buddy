CREATE TABLE IF NOT EXISTS public.ct_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  file_name text,
  detected_provider text,
  source_provider text NOT NULL DEFAULT 'file',
  status text NOT NULL DEFAULT 'draft',
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  headers jsonb NOT NULL DEFAULT '[]'::jsonb,
  row_count integer NOT NULL DEFAULT 0,
  notes text,
  concierge_requested_at timestamptz,
  concierge_note text,
  imported_at timestamptz,
  imported_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ct_migration_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_id uuid NOT NULL REFERENCES public.ct_migrations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  row_number integer NOT NULL DEFAULT 0,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  mapped jsonb NOT NULL DEFAULT '{}'::jsonb,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  match_stakeholder_id uuid REFERENCES public.ct_stakeholders(id) ON DELETE SET NULL,
  created_security_id uuid REFERENCES public.ct_securities(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_migrations TO authenticated;
GRANT ALL ON public.ct_migrations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_migration_rows TO authenticated;
GRANT ALL ON public.ct_migration_rows TO service_role;

ALTER TABLE public.ct_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ct_migration_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View cap migrations" ON public.ct_migrations
  FOR SELECT TO authenticated USING (public.ct_can_view(company_id));
CREATE POLICY "Manage cap migrations" ON public.ct_migrations
  FOR ALL TO authenticated USING (public.ct_can_manage(company_id))
  WITH CHECK (public.ct_can_manage(company_id));

CREATE POLICY "View cap migration rows" ON public.ct_migration_rows
  FOR SELECT TO authenticated USING (public.ct_can_view(company_id));
CREATE POLICY "Manage cap migration rows" ON public.ct_migration_rows
  FOR ALL TO authenticated USING (public.ct_can_manage(company_id))
  WITH CHECK (public.ct_can_manage(company_id));

CREATE INDEX IF NOT EXISTS ct_migrations_company_idx ON public.ct_migrations(company_id);
CREATE INDEX IF NOT EXISTS ct_migration_rows_migration_idx ON public.ct_migration_rows(migration_id);

CREATE TRIGGER ct_migrations_set_updated_at
  BEFORE UPDATE ON public.ct_migrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ct_migration_rows_set_updated_at
  BEFORE UPDATE ON public.ct_migration_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();