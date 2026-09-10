CREATE POLICY "funds readable by their client people"
ON public.offerings
FOR SELECT
TO authenticated
USING (client_id IS NOT NULL AND private.client_visible(auth.uid(), client_id));

CREATE POLICY "payment instructions readable by their client people"
ON public.payment_instructions
FOR SELECT
TO authenticated
USING (
  client_id IS NOT NULL
  AND private.client_visible(auth.uid(), client_id)
  AND status IN ('approved', 'sent', 'settled', 'completed', 'released')
);