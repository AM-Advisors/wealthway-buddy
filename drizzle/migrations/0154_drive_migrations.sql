CREATE TABLE public.drive_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  source_folder_id text NOT NULL,
  source_folder_name text,
  source_drive_id text,
  mode text NOT NULL CHECK (mode IN ('link','copy')),
  status text NOT NULL DEFAULT 'scanning' CHECK (status IN ('scanning','review','applying','done','failed')),
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drive_migrations_offering_idx ON public.drive_migrations(offering_id, created_at DESC);
GRANT ALL ON public.drive_migrations TO service_role;
ALTER TABLE public.drive_migrations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.drive_migration_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_id uuid NOT NULL REFERENCES public.drive_migrations(id) ON DELETE CASCADE,
  drive_file_id text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  path text,
  size_bytes bigint,
  suggested_category text,
  suggested_type text,
  suggested_reason text,
  investor_name text,
  category text,
  document_type text,
  profile_id uuid,
  onboarding_id uuid,
  action text NOT NULL DEFAULT 'pending' CHECK (action IN ('pending','accept','skip','duplicate','blocked')),
  result text NOT NULL DEFAULT 'none' CHECK (result IN ('none','done','failed','held')),
  result_message text,
  target_file_id text,
  document_id uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (migration_id, drive_file_id)
);
GRANT ALL ON public.drive_migration_items TO service_role;
ALTER TABLE public.drive_migration_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.drive_migration_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_id uuid NOT NULL REFERENCES public.drive_migrations(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.drive_migration_items(id) ON DELETE SET NULL,
  field text NOT NULL,
  proposed jsonb NOT NULL,
  current_value jsonb,
  source_file_name text,
  source_page integer,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','rejected','failed')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.drive_migration_suggestions TO service_role;
ALTER TABLE public.drive_migration_suggestions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.drive_migration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_id uuid NOT NULL REFERENCES public.drive_migrations(id) ON DELETE CASCADE,
  actor_user_id uuid,
  kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.drive_migration_events TO service_role;
ALTER TABLE public.drive_migration_events ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_drive_migration_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'drive_migration_events is append-only'; END $$;
CREATE TRIGGER drive_migration_events_append_only BEFORE UPDATE ON public.drive_migration_events
FOR EACH ROW EXECUTE FUNCTION public.block_drive_migration_event_mutation();