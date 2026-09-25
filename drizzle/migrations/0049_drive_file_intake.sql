CREATE TABLE public.drive_imported_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provenance text NOT NULL DEFAULT 'google_drive' CHECK (provenance = 'google_drive'),
  environment text NOT NULL CHECK (environment IN ('production','test')),
  source_repository text NOT NULL CHECK (source_repository IN ('fund','investor','test')),
  drive_file_id text NOT NULL,
  drive_id text NOT NULL,
  source_parent_id text,
  source_mapping_id uuid REFERENCES public.drive_folder_mappings(id) ON DELETE SET NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint,
  drive_modified_at timestamptz,
  drive_md5 text,
  sha256 text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  version_number int NOT NULL DEFAULT 1,
  previous_version_id uuid REFERENCES public.drive_imported_documents(id),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE RESTRICT,
  investment_profile_id uuid REFERENCES public.investment_profiles(id) ON DELETE RESTRICT,
  onboarding_id uuid REFERENCES public.investor_onboardings(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('fund','investor')),
  document_type text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('fund_general','investor_general','investor_restricted','harmonious_restricted')),
  document_date date,
  record_status text NOT NULL CHECK (record_status IN ('historical','active')),
  execution_evidence text NOT NULL DEFAULT 'none' CHECK (execution_evidence IN ('none','historical_executed')),
  review_state text NOT NULL DEFAULT 'not_applicable' CHECK (review_state IN ('not_applicable','evidence_received_needs_review')),
  broad_source_acknowledged boolean NOT NULL DEFAULT false,
  description text,
  imported_by uuid NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (drive_file_id, version_number),
  CHECK (category = 'fund' OR investment_profile_id IS NOT NULL)
);
CREATE UNIQUE INDEX drive_imported_documents_sha_uq ON public.drive_imported_documents (environment, sha256);
CREATE INDEX drive_imported_documents_offering_idx ON public.drive_imported_documents (offering_id);
COMMENT ON COLUMN public.drive_imported_documents.execution_evidence IS 'historical_executed = administrator attestation from a Drive copy; never Box-verified.';

CREATE TABLE public.drive_import_associations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.drive_imported_documents(id) ON DELETE RESTRICT,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE RESTRICT,
  investment_profile_id uuid REFERENCES public.investment_profiles(id) ON DELETE RESTRICT,
  onboarding_id uuid REFERENCES public.investor_onboardings(id) ON DELETE SET NULL,
  associated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX drive_import_associations_uq ON public.drive_import_associations
  (document_id, offering_id, coalesce(investment_profile_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE public.drive_import_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  event text NOT NULL,
  outcome text NOT NULL DEFAULT 'ok',
  repository text,
  drive_file_id text,
  document_id uuid,
  offering_id uuid,
  investment_profile_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drive_import_events_created_idx ON public.drive_import_events (created_at DESC);

CREATE OR REPLACE FUNCTION public.block_drive_import_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Imported Drive documents and their history are immutable; import a new version instead.';
END $$;
CREATE TRIGGER drive_imported_documents_immutable BEFORE UPDATE OR DELETE ON public.drive_imported_documents
  FOR EACH ROW EXECUTE FUNCTION public.block_drive_import_mutation();
CREATE TRIGGER drive_import_events_immutable BEFORE UPDATE OR DELETE ON public.drive_import_events
  FOR EACH ROW EXECUTE FUNCTION public.block_drive_import_mutation();
CREATE TRIGGER drive_import_associations_immutable BEFORE UPDATE OR DELETE ON public.drive_import_associations
  FOR EACH ROW EXECUTE FUNCTION public.block_drive_import_mutation();

GRANT SELECT ON public.drive_imported_documents, public.drive_import_associations, public.drive_import_events TO authenticated;
GRANT ALL ON public.drive_imported_documents, public.drive_import_associations, public.drive_import_events TO service_role;
ALTER TABLE public.drive_imported_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drive_import_associations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drive_import_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read Drive imports" ON public.drive_imported_documents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'super_admin'));
CREATE POLICY "Super admins read Drive import associations" ON public.drive_import_associations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'super_admin'));
CREATE POLICY "Super admins read Drive import events" ON public.drive_import_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'super_admin'));