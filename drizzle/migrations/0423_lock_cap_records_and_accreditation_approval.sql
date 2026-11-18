-- Share certificates: every write goes through server actions (service role).
DROP POLICY IF EXISTS "Client contacts create certificates" ON public.cap_certificates;
DROP POLICY IF EXISTS "Client contacts update certificates" ON public.cap_certificates;
REVOKE INSERT, UPDATE, DELETE ON public.cap_certificates FROM authenticated, anon;
GRANT SELECT ON public.cap_certificates TO authenticated;
GRANT ALL ON public.cap_certificates TO service_role;

-- Shareholder access rows: every write goes through server actions (service role).
DROP POLICY IF EXISTS "Client contacts create holder access" ON public.cap_holder_access;
DROP POLICY IF EXISTS "Client contacts update holder access" ON public.cap_holder_access;
REVOKE INSERT, UPDATE, DELETE ON public.cap_holder_access FROM authenticated, anon;
GRANT SELECT ON public.cap_holder_access TO authenticated;
GRANT ALL ON public.cap_holder_access TO service_role;

-- A shareholder access row or certificate must belong to the shareholder's own company.
CREATE OR REPLACE FUNCTION public.enforce_cap_stakeholder_same_client()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.stakeholder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cap_stakeholders s
    WHERE s.id = NEW.stakeholder_id AND s.client_id = NEW.client_id
  ) THEN
    RAISE EXCEPTION 'That shareholder does not belong to this company.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cap_holder_access_same_client ON public.cap_holder_access;
CREATE TRIGGER cap_holder_access_same_client
  BEFORE INSERT OR UPDATE OF client_id, stakeholder_id ON public.cap_holder_access
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cap_stakeholder_same_client();

DROP TRIGGER IF EXISTS cap_certificates_same_client ON public.cap_certificates;
CREATE TRIGGER cap_certificates_same_client
  BEFORE INSERT OR UPDATE OF client_id, stakeholder_id ON public.cap_certificates
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cap_stakeholder_same_client();

-- Holders only see records of the company that granted them access.
CREATE OR REPLACE FUNCTION public.cap_holder_can_view(_stakeholder_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.cap_holder_access a
    JOIN public.cap_stakeholders s ON s.id = a.stakeholder_id AND s.client_id = a.client_id
    WHERE a.stakeholder_id = _stakeholder_id
      AND a.kind = 'login'
      AND a.user_id = auth.uid()
      AND a.revoked_at IS NULL
      AND (a.expires_at IS NULL OR a.expires_at > now())
  )
$function$;

-- Accreditation approval is recorded only by server actions after their checks.
CREATE OR REPLACE FUNCTION public.block_client_accreditation_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _new text;
  _old text;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'investor_applications' THEN
    _new := NEW.accreditation_status::text;
    _old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.accreditation_status::text ELSE NULL END;
  ELSE
    _new := NEW.status::text;
    _old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status::text ELSE NULL END;
  END IF;
  IF _new = 'approved' AND _old IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Accreditation can only be approved through the accreditation step.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS investor_applications_block_client_accreditation ON public.investor_applications;
CREATE TRIGGER investor_applications_block_client_accreditation
  BEFORE INSERT OR UPDATE ON public.investor_applications
  FOR EACH ROW EXECUTE FUNCTION public.block_client_accreditation_approval();

DROP TRIGGER IF EXISTS accreditation_records_block_client_approval ON public.accreditation_records;
CREATE TRIGGER accreditation_records_block_client_approval
  BEFORE INSERT OR UPDATE ON public.accreditation_records
  FOR EACH ROW EXECUTE FUNCTION public.block_client_accreditation_approval();