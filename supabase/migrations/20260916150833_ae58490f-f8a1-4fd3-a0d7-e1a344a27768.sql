CREATE POLICY "Holders read their own transfers"
ON public.ct_secondary_transfers
FOR SELECT
TO authenticated
USING (
  (
    public.ct_is_holder(seller_stakeholder_id)
    AND COALESCE((SELECT p.can_view_transactions FROM public.ct_holder_permissions p WHERE p.stakeholder_id = ct_secondary_transfers.seller_stakeholder_id), true)
  )
  OR (
    buyer_stakeholder_id IS NOT NULL
    AND public.ct_is_holder(buyer_stakeholder_id)
    AND COALESCE((SELECT p.can_view_transactions FROM public.ct_holder_permissions p WHERE p.stakeholder_id = ct_secondary_transfers.buyer_stakeholder_id), true)
  )
);