CREATE TABLE public.drive_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL,
  issue_type text NOT NULL CHECK (issue_type IN ('conflict','needs_attention','permission_too_broad','upload_failed','mapping_missing','retry_failed')),
  offering_id uuid REFERENCES public.offerings(id) ON DELETE CASCADE,
  investment_profile_id uuid REFERENCES public.investment_profiles(id) ON DELETE CASCADE,
  mapping_id uuid REFERENCES public.drive_folder_mappings(id) ON DELETE SET NULL,
  source_table text,
  source_id uuid,
  detail text,
  last_action text,
  attempts integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX drive_exceptions_open_uq ON public.drive_exceptions (dedupe_key) WHERE status = 'open';
GRANT SELECT ON public.drive_exceptions TO authenticated;
GRANT ALL ON public.drive_exceptions TO service_role;
ALTER TABLE public.drive_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read drive exceptions" ON public.drive_exceptions FOR SELECT TO authenticated USING (public.is_any_staff());

ALTER TABLE public.drive_folder_mappings ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production' CHECK (environment IN ('production','test'));
ALTER TABLE public.drive_folder_mappings ADD COLUMN IF NOT EXISTS permission_audit jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS drive_folder_mappings_folder_uq ON public.drive_folder_mappings (folder_id) WHERE folder_id IS NOT NULL;

ALTER TABLE public.drive_filed_documents ADD COLUMN IF NOT EXISTS classification text NOT NULL DEFAULT 'investor_general' CHECK (classification IN ('fund_general','investor_general','investor_restricted','harmonious_restricted'));