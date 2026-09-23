-- Government ID copies: service-role only in storage. Browsers never read or write the bucket directly.
drop policy if exists "government ids are service-role only" on storage.objects;
create policy "government ids are service-role only"
on storage.objects as restrictive for all to authenticated, anon
using (bucket_id <> 'government-ids')
with check (bucket_id <> 'government-ids');

CREATE TABLE public.government_id_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid,
  application_id uuid not null references public.investor_applications(id) on delete cascade,
  kyc_verification_id uuid references public.kyc_verifications(id) on delete set null,
  investment_profile_id uuid,
  side text not null check (side in ('front','back','passport_page')),
  document_type text not null check (document_type in ('passport','drivers_license','state_id')),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  status text not null default 'pending' check (status in ('pending','active','superseded')),
  superseded_by uuid references public.government_id_documents(id),
  superseded_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
CREATE INDEX government_id_documents_app_idx ON public.government_id_documents (application_id, status);
CREATE INDEX government_id_documents_user_idx ON public.government_id_documents (user_id);

GRANT SELECT ON public.government_id_documents TO authenticated;
GRANT ALL ON public.government_id_documents TO service_role;
ALTER TABLE public.government_id_documents ENABLE ROW LEVEL SECURITY;
-- Investors see metadata for their own ID only. Writes happen server-side.
CREATE POLICY "Investors read own government id metadata" ON public.government_id_documents
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.government_id_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.government_id_documents(id) on delete cascade,
  user_id uuid not null,
  actor_id uuid not null,
  actor_role text not null check (actor_role in ('investor','reviewer')),
  action text not null check (action in ('uploaded','viewed','superseded','review_required')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
CREATE INDEX government_id_events_doc_idx ON public.government_id_events (document_id);
GRANT SELECT ON public.government_id_events TO authenticated;
GRANT ALL ON public.government_id_events TO service_role;
ALTER TABLE public.government_id_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Investors read own government id events" ON public.government_id_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.protect_government_id_events()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Government ID history cannot be changed or deleted';
END $$;
CREATE TRIGGER government_id_events_immutable BEFORE UPDATE OR DELETE ON public.government_id_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_government_id_events();

CREATE OR REPLACE FUNCTION public.protect_government_id_documents()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Confirmed government ID evidence cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.storage_path <> OLD.storage_path OR NEW.user_id <> OLD.user_id OR NEW.application_id <> OLD.application_id
       OR NEW.side <> OLD.side OR NEW.document_type <> OLD.document_type THEN
      RAISE EXCEPTION 'Government ID evidence is immutable';
    END IF;
    IF OLD.status = 'superseded' THEN
      RAISE EXCEPTION 'Superseded government ID evidence is immutable';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER government_id_documents_protect BEFORE UPDATE OR DELETE ON public.government_id_documents
  FOR EACH ROW EXECUTE FUNCTION public.protect_government_id_documents();