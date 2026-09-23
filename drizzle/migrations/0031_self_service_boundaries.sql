-- Fix: company creation must be limited to the caller's own client (previous check compared a column to itself).
DROP POLICY IF EXISTS ct_companies_insert ON public.ct_companies;
CREATE POLICY ct_companies_insert ON public.ct_companies
  FOR INSERT TO authenticated
  WITH CHECK (
    (NOT is_demo) AND (
      public.ct_is_staff()
      OR EXISTS (
        SELECT 1 FROM public.client_users cu
        WHERE cu.client_id = ct_companies.client_id
          AND cu.user_id = auth.uid()
          AND cu.client_role <> 'client_readonly'
      )
    )
  );

-- A client-created fund request can only start as a request; it can never arrive linked to a fund, SOW or entity.
CREATE OR REPLACE FUNCTION public.guard_client_fund_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR private.can_manage_contracts(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('draft','submitted','sow_issued') THEN
    RAISE EXCEPTION 'A new fund request can only be submitted for Harmonious review';
  END IF;
  IF NEW.offering_id IS NOT NULL OR NEW.entity_id IS NOT NULL OR NEW.sow_id IS NOT NULL THEN
    RAISE EXCEPTION 'A fund request cannot be linked to a fund by the requester';
  END IF;
  NEW.created_by := auth.uid();
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_client_fund_request() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_client_fund_request ON public.fund_requests;
CREATE TRIGGER guard_client_fund_request BEFORE INSERT ON public.fund_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_fund_request();