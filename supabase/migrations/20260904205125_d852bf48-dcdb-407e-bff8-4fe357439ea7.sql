-- 1. New role value (compared as text elsewhere so it is usable immediately)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'fund_manager';

-- 2. Assignment tables
CREATE TABLE public.fund_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, offering_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_managers TO authenticated;
GRANT ALL ON public.fund_managers TO service_role;
ALTER TABLE public.fund_managers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.investor_fund_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, offering_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investor_fund_access TO authenticated;
GRANT ALL ON public.investor_fund_access TO service_role;
ALTER TABLE public.investor_fund_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage fund managers" ON public.fund_managers
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "managers read own assignments" ON public.fund_managers
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "admins manage investor fund access" ON public.investor_fund_access
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "investors read own fund access" ON public.investor_fund_access
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 3. Login attempt history (written server-side with the service role)
CREATE TABLE public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  user_id uuid,
  success boolean NOT NULL,
  failure_reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_created_idx ON public.login_attempts (created_at DESC);
CREATE INDEX login_attempts_email_idx ON public.login_attempts (lower(email));
GRANT SELECT ON public.login_attempts TO authenticated;
GRANT ALL ON public.login_attempts TO service_role;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read login attempts" ON public.login_attempts
FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. Review-scope helpers
CREATE OR REPLACE FUNCTION private.manages_offering(_offering_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT private.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (SELECT 1 FROM public.fund_managers fm
                 WHERE fm.offering_id = _offering_id AND fm.user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION private.can_review_application(_app_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT private.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.investor_applications a
        JOIN public.fund_managers fm ON fm.offering_id = a.offering_id
        WHERE a.id = _app_id AND fm.user_id = auth.uid()
      )
$$;

REVOKE ALL ON FUNCTION private.manages_offering(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_review_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.manages_offering(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_review_application(uuid) TO authenticated, service_role;

-- 5. Fund-manager review access on application-scoped tables
CREATE POLICY "managers review applications" ON public.investor_applications
FOR ALL TO authenticated
USING (private.manages_offering(offering_id))
WITH CHECK (private.manages_offering(offering_id));

CREATE POLICY "managers manage notes" ON public.admin_notes
FOR ALL TO authenticated
USING (private.can_review_application(application_id))
WITH CHECK (private.can_review_application(application_id));

CREATE POLICY "managers manage investor emails" ON public.investor_emails
FOR ALL TO authenticated
USING (private.can_review_application(application_id))
WITH CHECK (private.can_review_application(application_id));

CREATE POLICY "managers manage payments" ON public.payments
FOR ALL TO authenticated
USING (private.can_review_application(application_id))
WITH CHECK (private.can_review_application(application_id));

CREATE POLICY "managers manage accreditation" ON public.accreditation_records
FOR ALL TO authenticated
USING (private.can_review_application(application_id))
WITH CHECK (private.can_review_application(application_id));

CREATE POLICY "managers manage kyc" ON public.kyc_verifications
FOR ALL TO authenticated
USING (private.can_review_application(application_id))
WITH CHECK (private.can_review_application(application_id));

CREATE POLICY "managers manage aml" ON public.aml_screenings
FOR ALL TO authenticated
USING (private.can_review_application(application_id))
WITH CHECK (private.can_review_application(application_id));

CREATE POLICY "managers manage subscriptions" ON public.subscriptions
FOR ALL TO authenticated
USING (private.can_review_application(application_id))
WITH CHECK (private.can_review_application(application_id));

CREATE POLICY "managers read signatures" ON public.document_signatures
FOR SELECT TO authenticated
USING (private.can_review_application(application_id));

CREATE POLICY "managers read accreditation documents" ON public.accreditation_documents
FOR SELECT TO authenticated
USING (private.can_review_application(application_id));

CREATE POLICY "managers read signature audit" ON public.signature_audit_events
FOR SELECT TO authenticated
USING (private.can_review_application(application_id));

CREATE POLICY "managers read profiles" ON public.profiles
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.investor_applications a
  JOIN public.fund_managers fm ON fm.offering_id = a.offering_id
  WHERE a.user_id = profiles.user_id AND fm.user_id = auth.uid()
));

-- 6. Private (506b) funds are only visible to admins, their managers and granted investors
DROP POLICY IF EXISTS "anyone reads offerings" ON public.offerings;

CREATE POLICY "public funds readable by visitors" ON public.offerings
FOR SELECT TO anon
USING (reg_type = '506c'::public.reg_type);

CREATE POLICY "funds readable by permitted users" ON public.offerings
FOR SELECT TO authenticated
USING (
  reg_type = '506c'::public.reg_type
  OR private.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.fund_managers fm
             WHERE fm.offering_id = offerings.id AND fm.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.investor_fund_access ia
             WHERE ia.offering_id = offerings.id AND ia.user_id = auth.uid())
);

DROP POLICY IF EXISTS "anyone reads offering docs" ON public.offering_documents;

CREATE POLICY "docs readable with their fund" ON public.offering_documents
FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.offerings o WHERE o.id = offering_documents.offering_id));