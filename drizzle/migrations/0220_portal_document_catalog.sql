CREATE TABLE public.document_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('box','google_drive')),
  label text NOT NULL,
  connection_reference text NOT NULL,
  purpose text NOT NULL DEFAULT 'historical_documents' CHECK (purpose = 'historical_documents'),
  read_only boolean NOT NULL DEFAULT true CHECK (read_only),
  allowed_root_ids text[] NOT NULL DEFAULT '{}',
  folder_mappings jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval','approved','suspended')),
  approved_by uuid, approved_at timestamptz,
  last_sync_at timestamptz,
  is_test_demo boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, connection_reference)
);
GRANT ALL ON public.document_sources TO service_role;
ALTER TABLE public.document_sources ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.document_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.document_sources(id),
  external_file_id text NOT NULL,
  external_revision text,
  parent_folder_id text,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  checksum text,
  document_type text NOT NULL DEFAULT 'k1',
  tax_year integer,
  offering_id uuid REFERENCES public.offerings(id),
  recipient_profile_id uuid REFERENCES public.investment_profiles(id),
  status text NOT NULL DEFAULT 'discovered' CHECK (status IN ('discovered','quarantined','matched','published','withdrawn','source_missing')),
  status_reason text,
  duplicate_of uuid REFERENCES public.document_catalog(id),
  source_modified_at timestamptz,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz, published_by uuid,
  is_test_demo boolean NOT NULL DEFAULT false,
  UNIQUE (source_id, external_file_id)
);
CREATE INDEX document_catalog_recipient_idx ON public.document_catalog (recipient_profile_id);
CREATE INDEX document_catalog_offering_idx ON public.document_catalog (offering_id, tax_year);
GRANT ALL ON public.document_catalog TO service_role;
ALTER TABLE public.document_catalog ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.document_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.document_catalog(id),
  principal_type text NOT NULL CHECK (principal_type IN ('investment_profile','user')),
  principal_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('grant','revoke')),
  access_level text NOT NULL DEFAULT 'view_download' CHECK (access_level = 'view_download'),
  reason text NOT NULL,
  decided_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_entitlements_doc_idx ON public.document_entitlements (document_id, principal_type, principal_id, created_at DESC);
GRANT ALL ON public.document_entitlements TO service_role;
ALTER TABLE public.document_entitlements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.document_match_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.document_catalog(id),
  candidate_profile_id uuid REFERENCES public.investment_profiles(id),
  candidate_offering_id uuid REFERENCES public.offerings(id),
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_status text NOT NULL DEFAULT 'open' CHECK (review_status IN ('open','approved','rejected')),
  reviewer_id uuid, reviewed_at timestamptz, review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX document_match_reviews_open_uidx ON public.document_match_reviews (document_id) WHERE review_status = 'open';
GRANT ALL ON public.document_match_reviews TO service_role;
ALTER TABLE public.document_match_reviews ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.document_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  document_id uuid,
  action text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('allow','deny')),
  reason_code text NOT NULL,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_access_events_time_idx ON public.document_access_events (created_at DESC);
GRANT ALL ON public.document_access_events TO service_role;
ALTER TABLE public.document_access_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.document_access_freezes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('all','offering','investment_profile','user','document')),
  scope_id uuid,
  reason text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  lifted_by uuid, lifted_at timestamptz, lift_reason text,
  CHECK ((scope = 'all') = (scope_id IS NULL))
);
GRANT ALL ON public.document_access_freezes TO service_role;
ALTER TABLE public.document_access_freezes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.connector_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.document_sources(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  discovered_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  missing_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed')),
  error_detail text,
  triggered_by uuid
);
GRANT ALL ON public.connector_sync_runs TO service_role;
ALTER TABLE public.connector_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_portal_document_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'This history is append-only.'; END $$;
CREATE TRIGGER document_entitlements_append_only BEFORE UPDATE OR DELETE ON public.document_entitlements FOR EACH ROW EXECUTE FUNCTION public.block_portal_document_history_mutation();
CREATE TRIGGER document_access_events_append_only BEFORE UPDATE OR DELETE ON public.document_access_events FOR EACH ROW EXECUTE FUNCTION public.block_portal_document_history_mutation();

CREATE OR REPLACE FUNCTION public.guard_document_freeze_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Access freezes are never deleted.'; END IF;
  IF OLD.lifted_at IS NOT NULL THEN RAISE EXCEPTION 'A lifted freeze cannot change.'; END IF;
  IF NEW.scope <> OLD.scope OR NEW.scope_id IS DISTINCT FROM OLD.scope_id OR NEW.reason <> OLD.reason OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Only lifting a freeze is allowed.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER document_access_freezes_guard BEFORE UPDATE OR DELETE ON public.document_access_freezes FOR EACH ROW EXECUTE FUNCTION public.guard_document_freeze_update();

INSERT INTO public.document_sources (provider, label, connection_reference, allowed_root_ids, folder_mappings, status, is_test_demo) VALUES
('box', 'TEST - Box historical K-1s (synthetic)', 'synthetic:box-historical-a', ARRAY['syn-box-root'],
 '[{"folder_id":"syn-box-wt","offering_id":"4014f341-8d38-4afc-9c18-ee21f8ae9224"},
   {"folder_id":"syn-box-wt-avery","offering_id":"4014f341-8d38-4afc-9c18-ee21f8ae9224","profile_id":"491cde73-16cd-41f7-b05d-032b90bbc6f1"},
   {"folder_id":"syn-box-wt-blake","offering_id":"4014f341-8d38-4afc-9c18-ee21f8ae9224","profile_id":"1b1e5475-21bc-4733-a171-74418fe408a6"},
   {"folder_id":"syn-box-wt-casey","offering_id":"4014f341-8d38-4afc-9c18-ee21f8ae9224","profile_id":"4cdde5e3-b8f0-4fac-b653-bb4316918e92"}]'::jsonb,
 'pending_approval', true),
('google_drive', 'TEST - Google Drive historical K-1s (synthetic)', 'synthetic:drive-historical-a', ARRAY['syn-drive-root'],
 '[{"folder_id":"syn-drive-portal","offering_id":"bd31d3e3-3c0e-400c-ac29-e9f47e00080f"},
   {"folder_id":"syn-drive-portal-wi","offering_id":"bd31d3e3-3c0e-400c-ac29-e9f47e00080f","profile_id":"d0443743-232a-45fd-a68a-394ccb51834a"},
   {"folder_id":"syn-drive-wt-northwind","offering_id":"4014f341-8d38-4afc-9c18-ee21f8ae9224","profile_id":"a775a802-137f-4b58-828b-5b58ca8f5faa"}]'::jsonb,
 'pending_approval', true);