-- 1. Move bank wire details out of the publicly readable offerings table
CREATE TABLE IF NOT EXISTS public.offering_wire_instructions (
  offering_id uuid PRIMARY KEY REFERENCES public.offerings(id) ON DELETE CASCADE,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.offering_wire_instructions TO authenticated;
GRANT ALL ON public.offering_wire_instructions TO service_role;
ALTER TABLE public.offering_wire_instructions ENABLE ROW LEVEL SECURITY;

INSERT INTO public.offering_wire_instructions (offering_id, details)
SELECT id, COALESCE(wire_instructions, '{}'::jsonb) FROM public.offerings
ON CONFLICT (offering_id) DO NOTHING;

ALTER TABLE public.offerings DROP COLUMN IF EXISTS wire_instructions;

-- 2. Relocate SECURITY DEFINER helpers out of the exposed API schema
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION private.owns_application(_app_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.investor_applications WHERE id = _app_id AND user_id = auth.uid()) $$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.owns_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.owns_application(uuid) TO authenticated, service_role;

DO $do$
DECLARE r record; sql text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (COALESCE(qual,'') ~ '(has_role|owns_application)\(' OR COALESCE(with_check,'') ~ '(has_role|owns_application)\(')
  LOOP
    sql := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF r.qual IS NOT NULL THEN
      sql := sql || format(' USING (%s)', regexp_replace(regexp_replace(r.qual, '(^|[^.\w])has_role\(', '\1private.has_role(', 'g'), '(^|[^.\w])owns_application\(', '\1private.owns_application(', 'g'));
    END IF;
    IF r.with_check IS NOT NULL THEN
      sql := sql || format(' WITH CHECK (%s)', regexp_replace(regexp_replace(r.with_check, '(^|[^.\w])has_role\(', '\1private.has_role(', 'g'), '(^|[^.\w])owns_application\(', '\1private.owns_application(', 'g'));
    END IF;
    EXECUTE sql;
  END LOOP;
END
$do$;

ALTER POLICY "own accreditation files read" ON storage.objects
USING ((bucket_id = 'accreditation-docs') AND (((auth.uid())::text = (storage.foldername(name))[1]) OR private.has_role(auth.uid(), 'admin'::public.app_role)));

ALTER POLICY "signed docs read" ON storage.objects
USING ((bucket_id = 'signed-documents') AND (((auth.uid())::text = (storage.foldername(name))[1]) OR private.has_role(auth.uid(), 'admin'::public.app_role)));

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.owns_application(uuid);

CREATE POLICY "users read own roles" ON public.user_roles
FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 3. Wire instruction visibility
CREATE POLICY "admins manage wire instructions" ON public.offering_wire_instructions
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "investors read wire instructions for their offering" ON public.offering_wire_instructions
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.investor_applications a
  WHERE a.offering_id = offering_wire_instructions.offering_id AND a.user_id = auth.uid()
));

-- 4. Explicit owner-scoped write policies for signing tables
CREATE POLICY "own signatures insert" ON public.document_signatures
FOR INSERT TO authenticated WITH CHECK (private.owns_application(application_id));

CREATE POLICY "own audit events insert" ON public.signature_audit_events
FOR INSERT TO authenticated WITH CHECK (private.owns_application(application_id));