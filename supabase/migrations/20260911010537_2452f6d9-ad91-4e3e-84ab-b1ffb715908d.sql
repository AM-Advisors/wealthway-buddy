ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS client_payment_method text,
  ADD COLUMN IF NOT EXISTS client_payment_reference text,
  ADD COLUMN IF NOT EXISTS client_paid_on date,
  ADD COLUMN IF NOT EXISTS client_payment_note text,
  ADD COLUMN IF NOT EXISTS client_payment_declared_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_payment_declared_by uuid;

CREATE OR REPLACE FUNCTION public.client_declare_invoice_payment(
  _invoice_id uuid,
  _method text,
  _paid_on date,
  _reference text DEFAULT NULL,
  _note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv public.invoices%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to record a payment.';
  END IF;
  SELECT * INTO _inv FROM public.invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That invoice is not available.';
  END IF;
  IF NOT private.client_visible(auth.uid(), _inv.client_id) OR private.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only a person attached to this client can record a payment on this invoice.';
  END IF;
  IF _inv.status <> 'issued' THEN
    RAISE EXCEPTION 'Only an issued invoice can be paid.';
  END IF;
  IF _inv.approval_status <> 'approved' THEN
    RAISE EXCEPTION 'Approve this invoice before recording a payment.';
  END IF;
  IF _method NOT IN ('wire','ach') THEN
    RAISE EXCEPTION 'Choose wire or ACH.';
  END IF;
  IF _paid_on IS NULL OR _paid_on > (current_date + 1) THEN
    RAISE EXCEPTION 'Enter the date you sent the payment.';
  END IF;

  UPDATE public.invoices SET
    client_payment_method = _method,
    client_payment_reference = nullif(btrim(coalesce(_reference,'')), ''),
    client_paid_on = _paid_on,
    client_payment_note = nullif(btrim(coalesce(_note,'')), ''),
    client_payment_declared_at = now(),
    client_payment_declared_by = auth.uid(),
    updated_at = now()
  WHERE id = _invoice_id;

  INSERT INTO public.contract_audit_events (
    client_id, actor_id, actor_role, area, action, target, previous_value, new_value, source
  ) VALUES (
    _inv.client_id, auth.uid(), 'client', 'invoice', 'payment_declared', _inv.number,
    jsonb_build_object('client_paid_on', _inv.client_paid_on, 'client_payment_method', _inv.client_payment_method),
    jsonb_build_object('client_paid_on', _paid_on, 'client_payment_method', _method, 'reference', btrim(coalesce(_reference,''))),
    'web'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.client_declare_invoice_payment(uuid, text, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_declare_invoice_payment(uuid, text, date, text, text) TO authenticated;