ALTER TABLE public.client_sows
  ADD COLUMN IF NOT EXISTS client_signature_name text,
  ADD COLUMN IF NOT EXISTS client_signature_title text,
  ADD COLUMN IF NOT EXISTS client_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_signature_ip text,
  ADD COLUMN IF NOT EXISTS client_signature_user_agent text,
  ADD COLUMN IF NOT EXISTS client_signed_user_id uuid,
  ADD COLUMN IF NOT EXISTS client_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS client_sent_back_reason text,
  ADD COLUMN IF NOT EXISTS client_sent_back_at timestamptz;

ALTER TABLE public.client_sows DROP CONSTRAINT IF EXISTS client_sows_client_status_check;
ALTER TABLE public.client_sows ADD CONSTRAINT client_sows_client_status_check
  CHECK (client_status IN ('pending','signed','sent_back'));

UPDATE public.client_sows
   SET client_status = 'signed',
       client_signed_at = COALESCE(client_signed_at, approved_at, now())
 WHERE approval_status = 'approved' AND client_status = 'pending';

CREATE INDEX IF NOT EXISTS client_sows_client_status_idx ON public.client_sows (client_status);

CREATE OR REPLACE FUNCTION public.client_sign_sow(
  _sow_id uuid,
  _name text,
  _title text DEFAULT NULL,
  _ip text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _sow public.client_sows%ROWTYPE;
BEGIN
  SELECT * INTO _sow FROM public.client_sows WHERE id = _sow_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That agreement is not available.';
  END IF;
  IF NOT private.client_visible(auth.uid(), _sow.client_id) OR private.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only a person attached to this client can sign.';
  END IF;
  IF _sow.status = 'draft' THEN
    RAISE EXCEPTION 'This agreement is not ready for signature yet.';
  END IF;
  IF _sow.approval_status = 'approved' THEN
    RAISE EXCEPTION 'This agreement is already approved and in force.';
  END IF;
  IF _sow.client_status = 'signed' THEN
    RAISE EXCEPTION 'This agreement is already signed.';
  END IF;
  IF _name IS NULL OR btrim(_name) = '' THEN
    RAISE EXCEPTION 'Type your full name to sign.';
  END IF;

  UPDATE public.client_sows SET
    client_status = 'signed',
    client_signature_name = btrim(_name),
    client_signature_title = NULLIF(btrim(_title), ''),
    client_signed_at = now(),
    client_signature_ip = NULLIF(btrim(_ip), ''),
    client_signature_user_agent = NULLIF(btrim(_user_agent), ''),
    client_signed_user_id = auth.uid(),
    client_sent_back_reason = NULL,
    client_sent_back_at = NULL,
    updated_at = now()
  WHERE id = _sow_id;

  INSERT INTO public.contract_audit_events (
    client_id, offering_id, actor_id, actor_role, area, action, target, previous_value, new_value
  ) VALUES (
    _sow.client_id, _sow.offering_id, auth.uid(), 'client', 'statement of work', 'client signed',
    _sow.title,
    jsonb_build_object('client_status', _sow.client_status),
    jsonb_build_object('client_status', 'signed', 'signature_name', btrim(_name), 'signature_title', NULLIF(btrim(_title), ''))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.client_sign_sow(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_sign_sow(uuid, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.client_send_back_sow(
  _sow_id uuid,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _sow public.client_sows%ROWTYPE;
BEGIN
  SELECT * INTO _sow FROM public.client_sows WHERE id = _sow_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That agreement is not available.';
  END IF;
  IF NOT private.client_visible(auth.uid(), _sow.client_id) OR private.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only a person attached to this client can send this back.';
  END IF;
  IF _sow.status = 'draft' THEN
    RAISE EXCEPTION 'This agreement is not ready for review yet.';
  END IF;
  IF _sow.approval_status = 'approved' THEN
    RAISE EXCEPTION 'This agreement is already approved and in force.';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Add a short reason so Harmonious knows what to change.';
  END IF;

  UPDATE public.client_sows SET
    client_status = 'sent_back',
    client_sent_back_reason = btrim(_reason),
    client_sent_back_at = now(),
    client_signature_name = NULL,
    client_signature_title = NULL,
    client_signed_at = NULL,
    client_signature_ip = NULL,
    client_signature_user_agent = NULL,
    client_signed_user_id = NULL,
    updated_at = now()
  WHERE id = _sow_id;

  INSERT INTO public.contract_audit_events (
    client_id, offering_id, actor_id, actor_role, area, action, target, previous_value, new_value
  ) VALUES (
    _sow.client_id, _sow.offering_id, auth.uid(), 'client', 'statement of work', 'client sent back',
    _sow.title,
    jsonb_build_object('client_status', _sow.client_status),
    jsonb_build_object('client_status', 'sent_back', 'reason', btrim(_reason))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.client_send_back_sow(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_send_back_sow(uuid, text) TO authenticated;

CREATE POLICY "staff manage client sow documents"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'fund-formation'
  AND (storage.foldername(name))[1] = 'client-sows'
  AND private.is_staff(auth.uid())
)
WITH CHECK (
  bucket_id = 'fund-formation'
  AND (storage.foldername(name))[1] = 'client-sows'
  AND private.is_staff(auth.uid())
);