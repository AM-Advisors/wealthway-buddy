ALTER TABLE public.offerings ADD COLUMN IF NOT EXISTS drive_sync_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE public.drive_folder_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_kind text NOT NULL CHECK (entity_kind IN ('fund','investor')),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  investment_profile_id uuid REFERENCES public.investment_profiles(id) ON DELETE CASCADE,
  harmonious_key text NOT NULL UNIQUE,
  folder_id text,
  folder_name text,
  subfolders jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','needs_attention','conflict','archived')),
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((entity_kind = 'fund' AND investment_profile_id IS NULL) OR (entity_kind = 'investor' AND investment_profile_id IS NOT NULL))
);
CREATE UNIQUE INDEX drive_folder_mappings_fund_uq ON public.drive_folder_mappings (offering_id) WHERE entity_kind = 'fund';
CREATE UNIQUE INDEX drive_folder_mappings_investor_uq ON public.drive_folder_mappings (offering_id, investment_profile_id) WHERE entity_kind = 'investor';
GRANT SELECT ON public.drive_folder_mappings TO authenticated;
GRANT ALL ON public.drive_folder_mappings TO service_role;
ALTER TABLE public.drive_folder_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read drive mappings" ON public.drive_folder_mappings FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE TABLE public.drive_filed_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  version text NOT NULL DEFAULT '1',
  target text NOT NULL,
  drive_file_id text NOT NULL,
  folder_id text NOT NULL,
  file_name text NOT NULL,
  filed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id, version, target)
);
GRANT SELECT ON public.drive_filed_documents TO authenticated;
GRANT ALL ON public.drive_filed_documents TO service_role;
ALTER TABLE public.drive_filed_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read drive filings" ON public.drive_filed_documents FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE TABLE public.drive_sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id uuid REFERENCES public.drive_folder_mappings(id) ON DELETE SET NULL,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  event text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  actor text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.drive_sync_events TO authenticated;
GRANT ALL ON public.drive_sync_events TO service_role;
ALTER TABLE public.drive_sync_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read drive events" ON public.drive_sync_events FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE OR REPLACE FUNCTION public.block_drive_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Drive audit events are immutable.'; END; $$;
CREATE TRIGGER drive_sync_events_immutable BEFORE UPDATE OR DELETE ON public.drive_sync_events FOR EACH ROW EXECUTE FUNCTION public.block_drive_event_mutation();