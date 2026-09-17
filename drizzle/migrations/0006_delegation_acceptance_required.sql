-- Proxy-capable delegations must be accepted by the professional before they
-- can be used. Acceptance is set by the database, never by the browser.
CREATE OR REPLACE FUNCTION public.delegation_requires_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.authority_level IN ('limited_proxy','authorized_signatory','transaction_authority')
     AND (TG_OP = 'INSERT' OR OLD.authority_level IS DISTINCT FROM NEW.authority_level)
     AND NEW.acceptance_state = 'not_required' THEN
    NEW.acceptance_state := 'awaiting_acceptance';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delegations_require_acceptance ON public.delegations;
CREATE TRIGGER delegations_require_acceptance
  BEFORE INSERT OR UPDATE ON public.delegations
  FOR EACH ROW EXECUTE FUNCTION public.delegation_requires_acceptance();

-- Existing proxy-level grants (if any) fall back to needing acceptance.
UPDATE public.delegations
SET acceptance_state = 'awaiting_acceptance'
WHERE authority_level IN ('limited_proxy','authorized_signatory','transaction_authority')
  AND acceptance_state = 'not_required';