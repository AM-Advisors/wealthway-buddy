ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS approval_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_approved_by uuid,
  ADD COLUMN IF NOT EXISTS client_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_signer_name text,
  ADD COLUMN IF NOT EXISTS dispute_reason text,
  ADD COLUMN IF NOT EXISTS payment_instruction_id uuid REFERENCES public.payment_instructions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rate_variance_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_override_reason text,
  ADD COLUMN IF NOT EXISTS rate_check jsonb;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_approval_status_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_approval_status_check
  CHECK (approval_status IN ('not_requested','pending','approved','disputed'));

ALTER TABLE public.payment_instructions
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payment_instructions_invoice_idx ON public.payment_instructions(invoice_id);

CREATE OR REPLACE FUNCTION public.respond_to_invoice(
  _invoice_id uuid,
  _decision text,
  _signer_name text DEFAULT NULL,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _inv public.invoices%ROWTYPE;
BEGIN
  SELECT * INTO _inv FROM public.invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That invoice is not available.';
  END IF;
  IF NOT private.client_visible(auth.uid(), _inv.client_id) OR private.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only a person attached to this client can respond to this invoice.';
  END IF;
  IF _inv.status <> 'issued' THEN
    RAISE EXCEPTION 'Only an issued invoice can be approved or disputed.';
  END IF;
  IF _inv.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'This invoice is not waiting on your approval.';
  END IF;
  IF _decision NOT IN ('approved','disputed') THEN
    RAISE EXCEPTION 'Unknown decision.';
  END IF;

  IF _decision = 'approved' THEN
    IF _signer_name IS NULL OR btrim(_signer_name) = '' THEN
      RAISE EXCEPTION 'Type your full name to approve this invoice.';
    END IF;
    UPDATE public.invoices SET
      approval_status = 'approved',
      client_signer_name = btrim(_signer_name),
      client_approved_by = auth.uid(),
      client_approved_at = now(),
      dispute_reason = NULL,
      updated_at = now()
    WHERE id = _invoice_id;
  ELSE
    IF _reason IS NULL OR btrim(_reason) = '' THEN
      RAISE EXCEPTION 'Tell us what is wrong with this invoice.';
    END IF;
    UPDATE public.invoices SET
      approval_status = 'disputed',
      dispute_reason = btrim(_reason),
      updated_at = now()
    WHERE id = _invoice_id;
  END IF;

  INSERT INTO public.contract_audit_events (
    client_id, actor_id, actor_role, area, action, target, previous_value, new_value, source
  ) VALUES (
    _inv.client_id, auth.uid(), 'client', 'invoice', _decision, _inv.number,
    jsonb_build_object('approval_status', _inv.approval_status),
    jsonb_build_object('approval_status', _decision, 'signer', btrim(coalesce(_signer_name, '')), 'reason', btrim(coalesce(_reason, ''))),
    'web'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_invoice(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_to_invoice(uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.respond_to_invoice(uuid, text, text, text) TO authenticated;