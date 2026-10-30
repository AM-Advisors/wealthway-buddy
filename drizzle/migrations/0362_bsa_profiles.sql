CREATE TABLE public.bsa_profiles (
  person_id uuid PRIMARY KEY REFERENCES public.persons(id),
  risk_rating text CHECK (risk_rating IN ('low','medium','high')),
  risk_reason text,
  source_of_funds text,
  source_of_wealth text,
  next_review_date date,
  last_reviewed_at timestamptz,
  last_reviewed_by uuid,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bsa_beneficial_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.persons(id),
  full_name text NOT NULL,
  ownership_percent numeric(6,3),
  role text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by uuid
);
CREATE TABLE public.bsa_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.persons(id),
  kind text NOT NULL CHECK (kind IN ('formation','ownership','source_of_funds','compliance_memo')),
  title text NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  archived_by uuid
);
CREATE TABLE public.bsa_profile_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.persons(id),
  event text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.bsa_beneficial_owners(person_id);
CREATE INDEX ON public.bsa_documents(person_id);
CREATE INDEX ON public.bsa_profile_events(person_id, created_at DESC);

-- Staff-only: reachable only through server functions that verify Harmonious staff. No client grants or policies.
GRANT ALL ON public.bsa_profiles, public.bsa_beneficial_owners, public.bsa_documents, public.bsa_profile_events TO service_role;
ALTER TABLE public.bsa_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bsa_beneficial_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bsa_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bsa_profile_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_bsa_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'BSA review history is append-only'; END $$;
CREATE TRIGGER bsa_events_append_only BEFORE UPDATE OR DELETE ON public.bsa_profile_events FOR EACH ROW EXECUTE FUNCTION public.block_bsa_event_mutation();

CREATE OR REPLACE FUNCTION public.block_bsa_document_delete() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'BSA documents are archived, never deleted'; END $$;
CREATE TRIGGER bsa_documents_no_delete BEFORE DELETE ON public.bsa_documents FOR EACH ROW EXECUTE FUNCTION public.block_bsa_document_delete();
CREATE TRIGGER bsa_owners_no_delete BEFORE DELETE ON public.bsa_beneficial_owners FOR EACH ROW EXECUTE FUNCTION public.block_bsa_document_delete();