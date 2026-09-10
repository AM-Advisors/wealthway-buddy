ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS signer_name text,
  ADD COLUMN IF NOT EXISTS signer_title text,
  ADD COLUMN IF NOT EXISTS signed_ip text,
  ADD COLUMN IF NOT EXISTS amendment_terms text,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_by uuid,
  ADD COLUMN IF NOT EXISTS declined_reason text,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;

-- CEO/CRO are executive titles: contract authority now includes the executive role.
CREATE OR REPLACE FUNCTION private.can_manage_contracts(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','super_admin','legal','client_success','compliance','finance','executive')
  )
$function$;

-- Client signs the quoted amendment. Guarded: own client, quoted status only,
-- and only acceptance fields are written.
CREATE OR REPLACE FUNCTION public.accept_service_quote(
  _request_id uuid,
  _signer_name text,
  _signer_title text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _req public.service_requests%ROWTYPE;
BEGIN
  SELECT * INTO _req FROM public.service_requests WHERE id = _request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request is not available.';
  END IF;
  IF NOT private.client_visible(auth.uid(), _req.client_id) OR private.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only a person attached to this client can sign.';
  END IF;
  IF _req.status <> 'quoted' THEN
    RAISE EXCEPTION 'This request is not waiting on a signature.';
  END IF;
  IF _signer_name IS NULL OR btrim(_signer_name) = '' THEN
    RAISE EXCEPTION 'Type your full name to sign.';
  END IF;

  UPDATE public.service_requests SET
    status = 'signed',
    signer_name = btrim(_signer_name),
    signer_title = NULLIF(btrim(_signer_title), ''),
    client_approved_by = auth.uid(),
    client_approved_at = now(),
    updated_at = now()
  WHERE id = _request_id;

  INSERT INTO public.contract_audit_events (
    client_id, offering_id, actor_id, actor_role, area, action, target, previous_value, new_value
  ) VALUES (
    _req.client_id, _req.offering_id, auth.uid(), 'client', 'service request', 'signed',
    _req.service_key, jsonb_build_object('status', _req.status),
    jsonb_build_object('status', 'signed', 'signer', btrim(_signer_name))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_service_quote(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_service_quote(uuid, text, text) TO authenticated;

-- Client withdraws their own request before it is active.
CREATE OR REPLACE FUNCTION public.withdraw_service_request(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _req public.service_requests%ROWTYPE;
BEGIN
  SELECT * INTO _req FROM public.service_requests WHERE id = _request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request is not available.';
  END IF;
  IF NOT private.client_visible(auth.uid(), _req.client_id) OR private.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only a person attached to this client can withdraw it.';
  END IF;
  IF _req.status IN ('activated', 'withdrawn') THEN
    RAISE EXCEPTION 'This request can no longer be withdrawn.';
  END IF;

  UPDATE public.service_requests SET
    status = 'withdrawn',
    withdrawn_at = now(),
    updated_at = now()
  WHERE id = _request_id;

  INSERT INTO public.contract_audit_events (
    client_id, offering_id, actor_id, actor_role, area, action, target, previous_value, new_value
  ) VALUES (
    _req.client_id, _req.offering_id, auth.uid(), 'client', 'service request', 'withdrawn',
    _req.service_key, jsonb_build_object('status', _req.status),
    jsonb_build_object('status', 'withdrawn')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.withdraw_service_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.withdraw_service_request(uuid) TO authenticated;

-- Amendment PDFs live privately under service-amendments/ in the fund-formation bucket.
CREATE POLICY "staff manage service amendments"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'fund-formation'
  AND (storage.foldername(name))[1] = 'service-amendments'
  AND private.is_staff(auth.uid())
)
WITH CHECK (
  bucket_id = 'fund-formation'
  AND (storage.foldername(name))[1] = 'service-amendments'
  AND private.is_staff(auth.uid())
);