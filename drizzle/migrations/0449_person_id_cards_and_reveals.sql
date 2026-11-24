CREATE TABLE public.person_id_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.persons(id),
  document_type text NOT NULL CHECK (document_type IN ('passport','drivers_license','state_id','unknown')),
  side text NOT NULL CHECK (side IN ('front','back','passport_page')),
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','superseded')),
  read_name text, read_birth_date date, id_number_last4 text, expires_on date, issuing_region text, read_confidence text,
  source text NOT NULL DEFAULT 'upload',
  source_government_id uuid UNIQUE,
  onboarding_id uuid, offering_id uuid,
  uploaded_by uuid,
  superseded_by uuid, superseded_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.person_id_documents TO service_role;
ALTER TABLE public.person_id_documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX person_id_documents_person_idx ON public.person_id_documents(person_id, status);

CREATE TABLE public.person_identifier_reveals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid, investment_profile_id uuid, onboarding_id uuid, offering_id uuid,
  kind text NOT NULL CHECK (kind IN ('ssn','ein','id_card')),
  actor_user_id uuid NOT NULL, actor_role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.person_identifier_reveals TO service_role;
ALTER TABLE public.person_identifier_reveals ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_identifier_reveal_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Reveal history cannot be changed'; END $$;
CREATE TRIGGER person_identifier_reveals_immutable BEFORE UPDATE OR DELETE ON public.person_identifier_reveals
FOR EACH ROW EXECUTE FUNCTION public.block_identifier_reveal_mutation();

INSERT INTO public.person_id_documents (person_id, document_type, side, storage_path, file_name, mime_type, size_bytes, status, source, source_government_id, uploaded_by, confirmed_at, created_at)
SELECT g.person_id, g.document_type, g.side, g.storage_path, g.file_name, g.mime_type, g.size_bytes, g.status, 'investor_upload', g.id, g.user_id, g.confirmed_at, g.created_at
FROM public.government_id_documents g WHERE g.person_id IS NOT NULL AND g.status IN ('active','superseded');