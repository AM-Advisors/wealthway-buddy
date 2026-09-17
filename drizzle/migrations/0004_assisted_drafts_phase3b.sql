-- Phase 3B: professional assisted actions.
-- Professionals may PREPARE material for a client. Nothing here is authoritative:
-- every draft waits for the principal's own review, and no protected verification,
-- payment, banking or signature field is reachable from this surface.

DO $$ BEGIN
  CREATE TYPE public.assisted_draft_status AS ENUM (
    'awaiting_client_review','approved','rejected','changes_requested','withdrawn'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.assisted_draft_type AS ENUM (
    'profile_contact','entity_information','ownership_information',
    'investment_questionnaire','kyc_support','kyb_support','accreditation','investment'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.assisted_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_id uuid NOT NULL REFERENCES public.delegations(id) ON DELETE RESTRICT,
  organization_id uuid REFERENCES public.professional_organizations(id) ON DELETE SET NULL,
  prepared_by_user_id uuid NOT NULL,
  principal_user_id uuid NOT NULL,
  draft_type public.assisted_draft_type NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  title text NOT NULL,
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  final_state jsonb,
  preparer_note text,
  client_note text,
  status public.assisted_draft_status NOT NULL DEFAULT 'awaiting_client_review',
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assisted_drafts_principal_idx ON public.assisted_drafts (principal_user_id, status);
CREATE INDEX IF NOT EXISTS assisted_drafts_preparer_idx ON public.assisted_drafts (prepared_by_user_id);
CREATE INDEX IF NOT EXISTS assisted_drafts_delegation_idx ON public.assisted_drafts (delegation_id);

GRANT SELECT ON public.assisted_drafts TO authenticated;
GRANT ALL ON public.assisted_drafts TO service_role;
ALTER TABLE public.assisted_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "principal reads items prepared for them"
  ON public.assisted_drafts FOR SELECT TO authenticated
  USING (principal_user_id = auth.uid());

CREATE POLICY "preparer reads their own prepared items"
  ON public.assisted_drafts FOR SELECT TO authenticated
  USING (prepared_by_user_id = auth.uid());

CREATE POLICY "staff read prepared items"
  ON public.assisted_drafts FOR SELECT TO authenticated
  USING (public.is_any_staff());

-- Append-only lifecycle history: before / proposed / decision / final.
CREATE TABLE IF NOT EXISTS public.assisted_draft_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.assisted_drafts(id) ON DELETE CASCADE,
  principal_user_id uuid NOT NULL,
  prepared_by_user_id uuid NOT NULL,
  actor_user_id uuid,
  actor_kind text NOT NULL,
  organization_id uuid,
  delegation_id uuid,
  action text NOT NULL,
  from_status text,
  to_status text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assisted_draft_events_draft_idx ON public.assisted_draft_events (draft_id, created_at DESC);

GRANT SELECT ON public.assisted_draft_events TO authenticated;
GRANT ALL ON public.assisted_draft_events TO service_role;
ALTER TABLE public.assisted_draft_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parties read draft history"
  ON public.assisted_draft_events FOR SELECT TO authenticated
  USING (principal_user_id = auth.uid() OR prepared_by_user_id = auth.uid() OR public.is_any_staff());

-- Every document a professional uploads keeps the full agency chain.
CREATE TABLE IF NOT EXISTS public.assisted_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_id uuid NOT NULL REFERENCES public.delegations(id) ON DELETE RESTRICT,
  organization_id uuid REFERENCES public.professional_organizations(id) ON DELETE SET NULL,
  uploaded_by_user_id uuid NOT NULL,
  principal_user_id uuid NOT NULL,
  draft_id uuid REFERENCES public.assisted_drafts(id) ON DELETE SET NULL,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  original_filename text NOT NULL,
  storage_path text NOT NULL,
  classification text NOT NULL,
  investor_document_id uuid REFERENCES public.investor_documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assisted_documents_principal_idx ON public.assisted_documents (principal_user_id);
CREATE INDEX IF NOT EXISTS assisted_documents_resource_idx ON public.assisted_documents (resource_type, resource_id);

GRANT SELECT ON public.assisted_documents TO authenticated;
GRANT ALL ON public.assisted_documents TO service_role;
ALTER TABLE public.assisted_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parties read assisted uploads"
  ON public.assisted_documents FOR SELECT TO authenticated
  USING (principal_user_id = auth.uid() OR uploaded_by_user_id = auth.uid() OR public.is_any_staff());

-- "Items prepared for me" notifications for the principal.
CREATE TABLE IF NOT EXISTS public.assisted_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_user_id uuid NOT NULL,
  draft_id uuid REFERENCES public.assisted_drafts(id) ON DELETE CASCADE,
  kind text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS assisted_notifications_principal_idx ON public.assisted_notifications (principal_user_id, created_at DESC);

GRANT SELECT ON public.assisted_notifications TO authenticated;
GRANT ALL ON public.assisted_notifications TO service_role;
ALTER TABLE public.assisted_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "principal reads their prepared-item notices"
  ON public.assisted_notifications FOR SELECT TO authenticated
  USING (principal_user_id = auth.uid());

DROP TRIGGER IF EXISTS assisted_drafts_set_updated_at ON public.assisted_drafts;
CREATE TRIGGER assisted_drafts_set_updated_at
  BEFORE UPDATE ON public.assisted_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();