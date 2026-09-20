-- 1. Signature placement data must follow the same visibility as the document itself.
DROP POLICY IF EXISTS "signature blocks readable with the document" ON public.offering_document_signature_blocks;

CREATE POLICY "signature blocks readable by permitted users"
ON public.offering_document_signature_blocks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.offering_documents d
    JOIN public.offerings o ON o.id = d.offering_id
    WHERE d.id = offering_document_signature_blocks.offering_document_id
      AND (
        o.reg_type = '506c'::reg_type
        OR private.has_role(auth.uid(), 'admin'::app_role)
        OR EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = o.id AND fm.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.investor_fund_access ia WHERE ia.offering_id = o.id AND ia.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.investor_applications a WHERE a.offering_id = o.id AND a.user_id = auth.uid())
      )
  )
);

CREATE POLICY "public signature blocks readable by visitors"
ON public.offering_document_signature_blocks
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.offering_documents d
    JOIN public.offerings o ON o.id = d.offering_id
    WHERE d.id = offering_document_signature_blocks.offering_document_id
      AND o.reg_type = '506c'::reg_type
  )
);

-- 2. Unpublished rate cards are internal working documents.
DROP POLICY IF EXISTS "pricing versions readable" ON public.pricing_versions;
CREATE POLICY "published rate cards readable"
ON public.pricing_versions
FOR SELECT
TO authenticated
USING (status = 'published' OR private.is_staff(auth.uid()) OR private.can_manage_contracts(auth.uid()));

DROP POLICY IF EXISTS "pricing items readable" ON public.pricing_items;
CREATE POLICY "published rate card lines readable"
ON public.pricing_items
FOR SELECT
TO authenticated
USING (
  private.is_staff(auth.uid())
  OR private.can_manage_contracts(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.pricing_versions v
    WHERE v.id = pricing_items.version_id AND v.status = 'published'
  )
);

-- 3. Retired / unpublished catalogue entries and internal delivery notes stay internal.
DROP POLICY IF EXISTS "catalog readable" ON public.service_catalog;
CREATE POLICY "active catalog readable"
ON public.service_catalog
FOR SELECT
TO authenticated
USING (active OR private.is_staff(auth.uid()) OR private.can_manage_contracts(auth.uid()));

-- 4. Vendor relationships: staff, contract managers, and that vendor's own contacts.
DROP POLICY IF EXISTS "providers readable" ON public.third_party_providers;
CREATE POLICY "providers readable by staff and their own contacts"
ON public.third_party_providers
FOR SELECT
TO authenticated
USING (
  private.is_staff(auth.uid())
  OR private.can_manage_contracts(auth.uid())
  OR private.provider_member(auth.uid(), third_party_providers.id)
);

-- 5. Eligibility rules: only rules actually in force are visible outside staff.
DROP POLICY IF EXISTS "eligibility rules readable" ON public.eligibility_rules;
CREATE POLICY "active eligibility rules readable"
ON public.eligibility_rules
FOR SELECT
TO authenticated
USING (active OR private.is_staff(auth.uid()) OR private.can_manage_contracts(auth.uid()));

-- 6. Trigger functions are never meant to be called directly through the API.
--    Triggers fire regardless of EXECUTE privilege, so revoking is safe.
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
  END LOOP;
END $$;

-- 7. RLS helper predicates should not be callable by signed-out visitors.
REVOKE ALL ON FUNCTION public.is_any_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_contract_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_client_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fund_setup_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_any_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_contract_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_client_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fund_setup_manager(uuid) TO authenticated;