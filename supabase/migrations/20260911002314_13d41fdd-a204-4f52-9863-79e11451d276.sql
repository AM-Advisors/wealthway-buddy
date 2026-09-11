DROP POLICY IF EXISTS "payment instructions readable by their client people" ON public.payment_instructions;

CREATE POLICY "payment instructions readable by their client people"
ON public.payment_instructions FOR SELECT TO authenticated
USING (client_id IS NOT NULL AND private.client_visible(auth.uid(), client_id));

CREATE POLICY "wire requests readable by their client people"
ON public.wire_requests FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.offerings o
    WHERE o.id = wire_requests.offering_id
      AND o.client_id IS NOT NULL
      AND private.client_visible(auth.uid(), o.client_id)
  )
);

CREATE OR REPLACE FUNCTION public.client_create_wire_request(
  _offering_id uuid,
  _amount_cents bigint,
  _purpose text DEFAULT 'expense',
  _expected_date date DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _client_id uuid;
  _id uuid;
BEGIN
  SELECT o.client_id INTO _client_id FROM public.offerings o WHERE o.id = _offering_id;
  IF _client_id IS NULL THEN
    RAISE EXCEPTION 'That fund is not linked to a client engagement.';
  END IF;
  IF private.is_staff(auth.uid()) OR NOT EXISTS (
    SELECT 1 FROM public.client_users cu
    WHERE cu.client_id = _client_id AND cu.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only a contact on this client can request a wire.';
  END IF;
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN
    RAISE EXCEPTION 'Enter an amount greater than zero.';
  END IF;
  IF _purpose NOT IN ('investor_wire','capital_call','expense','distribution','other') THEN
    RAISE EXCEPTION 'Choose a valid purpose.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.service_entitlements se
    WHERE se.client_id = _client_id
      AND se.service_key = 'wire_instructions'
      AND se.status = 'included'
      AND (se.offering_id IS NULL OR se.offering_id = _offering_id)
  ) THEN
    RAISE EXCEPTION 'This service is not currently included in your active scope. Request service.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.compliance_holds h
    WHERE h.status = 'active'
      AND (h.client_id = _client_id OR h.offering_id = _offering_id)
      AND (h.service_key IS NULL OR h.service_key = 'wire_instructions')
  ) THEN
    RAISE EXCEPTION 'A compliance hold is in place. Your Harmonious contact will follow up.';
  END IF;

  INSERT INTO public.wire_requests (offering_id, requested_by, amount_cents, purpose, note, expected_date, status)
  VALUES (_offering_id, auth.uid(), _amount_cents, _purpose, NULLIF(btrim(_note), ''), _expected_date, 'pending')
  RETURNING id INTO _id;

  INSERT INTO public.contract_audit_events (
    client_id, offering_id, actor_id, actor_role, area, action, target, previous_value, new_value
  ) VALUES (
    _client_id, _offering_id, auth.uid(), 'client', 'money movement', 'wire requested by client',
    _id::text, NULL,
    jsonb_build_object('amount_cents', _amount_cents, 'purpose', _purpose, 'expected_date', _expected_date)
  );

  RETURN _id;
END;
$function$;

REVOKE ALL ON FUNCTION public.client_create_wire_request(uuid, bigint, text, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_create_wire_request(uuid, bigint, text, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.client_create_wire_request(uuid, bigint, text, date, text) TO authenticated;