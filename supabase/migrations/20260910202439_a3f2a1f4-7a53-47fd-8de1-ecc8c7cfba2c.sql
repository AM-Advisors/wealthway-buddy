-- Provider contacts -----------------------------------------------------
CREATE TABLE public.provider_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.third_party_providers(id) ON DELETE CASCADE,
  email text NOT NULL,
  contact_name text,
  title text,
  user_id uuid,
  invited_by uuid,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX provider_users_provider_email_idx ON public.provider_users (provider_id, lower(email));
CREATE INDEX provider_users_user_idx ON public.provider_users (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_users TO authenticated;
GRANT ALL ON public.provider_users TO service_role;
ALTER TABLE public.provider_users ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.provider_member(_uid uuid, _provider uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL AND _provider IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.provider_users pu
    WHERE pu.provider_id = _provider
      AND pu.status = 'active'
      AND (
        pu.user_id = _uid
        OR lower(pu.email) = (SELECT lower(u.email) FROM auth.users u WHERE u.id = _uid)
      )
  )
$$;

CREATE OR REPLACE FUNCTION private.is_provider_contact(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.provider_users pu
    WHERE pu.status = 'active'
      AND (
        pu.user_id = _uid
        OR lower(pu.email) = (SELECT lower(u.email) FROM auth.users u WHERE u.id = _uid)
      )
  )
$$;

CREATE POLICY "Staff and the contact can see provider contacts"
ON public.provider_users FOR SELECT TO authenticated
USING (
  private.is_staff(auth.uid())
  OR user_id = auth.uid()
  OR lower(email) = (SELECT lower(u.email) FROM auth.users u WHERE u.id = auth.uid())
);

CREATE POLICY "Contract authority manages provider contacts"
ON public.provider_users FOR ALL TO authenticated
USING (private.can_manage_contracts(auth.uid()))
WITH CHECK (private.can_manage_contracts(auth.uid()));

CREATE TRIGGER provider_users_updated BEFORE UPDATE ON public.provider_users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Provider cost submissions --------------------------------------------
CREATE TABLE public.provider_expense_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.third_party_providers(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  description text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  incurred_on date NOT NULL,
  reference text,
  note text,
  file_path text,
  status text NOT NULL DEFAULT 'submitted',
  submitted_by uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  expense_id uuid REFERENCES public.pass_through_expenses(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX provider_expense_submissions_provider_idx ON public.provider_expense_submissions (provider_id, submitted_at DESC);
CREATE INDEX provider_expense_submissions_status_idx ON public.provider_expense_submissions (status, submitted_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_expense_submissions TO authenticated;
GRANT ALL ON public.provider_expense_submissions TO service_role;
ALTER TABLE public.provider_expense_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff and the provider can see their submissions"
ON public.provider_expense_submissions FOR SELECT TO authenticated
USING (private.is_staff(auth.uid()) OR private.provider_member(auth.uid(), provider_id));

CREATE POLICY "Provider contacts add their own submissions"
ON public.provider_expense_submissions FOR INSERT TO authenticated
WITH CHECK (private.provider_member(auth.uid(), provider_id) AND submitted_by = auth.uid());

CREATE POLICY "Provider contacts edit submissions still under review"
ON public.provider_expense_submissions FOR UPDATE TO authenticated
USING (private.provider_member(auth.uid(), provider_id) AND status = 'submitted')
WITH CHECK (private.provider_member(auth.uid(), provider_id) AND status IN ('submitted','withdrawn'));

CREATE POLICY "Contract authority reviews submissions"
ON public.provider_expense_submissions FOR ALL TO authenticated
USING (private.can_manage_contracts(auth.uid()))
WITH CHECK (private.can_manage_contracts(auth.uid()));

CREATE TRIGGER provider_expense_submissions_updated BEFORE UPDATE ON public.provider_expense_submissions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Provider documents ----------------------------------------------------
CREATE TABLE public.provider_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.third_party_providers(id) ON DELETE CASCADE,
  title text NOT NULL,
  doc_type text NOT NULL DEFAULT 'other',
  file_path text NOT NULL,
  file_name text,
  expires_on date,
  note text,
  status text NOT NULL DEFAULT 'submitted',
  submitted_by uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX provider_documents_provider_idx ON public.provider_documents (provider_id, submitted_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_documents TO authenticated;
GRANT ALL ON public.provider_documents TO service_role;
ALTER TABLE public.provider_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff and the provider can see their documents"
ON public.provider_documents FOR SELECT TO authenticated
USING (private.is_staff(auth.uid()) OR private.provider_member(auth.uid(), provider_id));

CREATE POLICY "Provider contacts add their own documents"
ON public.provider_documents FOR INSERT TO authenticated
WITH CHECK (private.provider_member(auth.uid(), provider_id) AND submitted_by = auth.uid());

CREATE POLICY "Contract authority reviews provider documents"
ON public.provider_documents FOR ALL TO authenticated
USING (private.can_manage_contracts(auth.uid()))
WITH CHECK (private.can_manage_contracts(auth.uid()));

CREATE TRIGGER provider_documents_updated BEFORE UPDATE ON public.provider_documents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage policies for provider uploads (bucket created separately) -----
CREATE POLICY "Provider contacts read their own uploads"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'provider-uploads'
  AND (
    private.is_staff(auth.uid())
    OR private.provider_member(auth.uid(), NULLIF(split_part(name, '/', 1), '')::uuid)
  )
);

CREATE POLICY "Provider contacts upload into their own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'provider-uploads'
  AND (
    private.can_manage_contracts(auth.uid())
    OR private.provider_member(auth.uid(), NULLIF(split_part(name, '/', 1), '')::uuid)
  )
);