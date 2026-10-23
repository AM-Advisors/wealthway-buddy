CREATE OR REPLACE FUNCTION public.sign_client_msa(
  p_client_id uuid, p_version_id uuid, p_signer_name text,
  p_signer_title text, p_typed_signature text, p_company text DEFAULT NULL,
  p_signature_image text DEFAULT NULL, p_signature_method text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  designated uuid;
  latest_version uuid;
  version_label text;
  agreement public.client_msa_agreements%ROWTYPE;
  signature_exists boolean;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in before signing this agreement.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.client_users WHERE client_id = p_client_id AND user_id = actor)
     AND NOT EXISTS (
       SELECT 1 FROM public.fund_managers fm JOIN public.offerings o ON o.id = fm.offering_id
       WHERE fm.user_id = actor AND o.client_id = p_client_id
     ) THEN RAISE EXCEPTION 'This agreement belongs to another client.'; END IF;
  SELECT msa_signer_user_id INTO designated FROM public.clients WHERE id = p_client_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client not found.'; END IF;
  IF designated IS NOT NULL AND designated <> actor THEN
    RAISE EXCEPTION 'Another person on your team has been assigned to sign this agreement.';
  END IF;
  SELECT id, version INTO latest_version, version_label FROM public.msa_versions
    WHERE status = 'published' ORDER BY effective_date DESC LIMIT 1;
  IF latest_version IS NULL OR p_version_id IS DISTINCT FROM latest_version THEN
    RAISE EXCEPTION 'The agreement changed. Review the current version before signing.';
  END IF;
  IF length(trim(coalesce(p_signer_name, ''))) < 2
     OR length(trim(coalesce(p_signer_title, ''))) < 1
     OR length(trim(coalesce(p_typed_signature, ''))) < 2 THEN
    RAISE EXCEPTION 'Enter your legal name, signing title and signature.';
  END IF;
  INSERT INTO public.client_msa_agreements(client_id, msa_version_id, status)
    VALUES (p_client_id, latest_version, 'in_review')
    ON CONFLICT (client_id, msa_version_id) DO NOTHING;
  SELECT * INTO agreement FROM public.client_msa_agreements
    WHERE client_id = p_client_id AND msa_version_id = latest_version FOR UPDATE;
  IF agreement.executed_at IS NOT NULL OR agreement.status = 'executed' THEN
    RETURN jsonb_build_object('agreementId', agreement.id, 'alreadyExecuted', true, 'newSignature', false);
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.agreement_signatures
    WHERE msa_agreement_id = agreement.id AND scope = 'msa' AND side = 'client') INTO signature_exists;
  IF NOT signature_exists THEN
    INSERT INTO public.agreement_signatures(
      scope, client_id, msa_agreement_id, side, company, signer_name, signer_title,
      signer_email, signer_user_id, typed_signature, version_label, signature_image, signature_method
    ) VALUES (
      'msa', p_client_id, agreement.id, 'client', p_company, trim(p_signer_name), trim(p_signer_title),
      auth.jwt()->>'email', actor, p_typed_signature, version_label, p_signature_image, p_signature_method
    );
  END IF;
  UPDATE public.client_msa_agreements SET status = 'client_signed',
    client_approved_at = coalesce(client_approved_at, now()) WHERE id = agreement.id;
  RETURN jsonb_build_object('agreementId', agreement.id, 'alreadyExecuted', false, 'newSignature', NOT signature_exists);
END;
$$;
REVOKE ALL ON FUNCTION public.sign_client_msa(uuid,uuid,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_client_msa(uuid,uuid,text,text,text,text,text,text) TO authenticated;
COMMENT ON FUNCTION public.sign_client_msa(uuid,uuid,text,text,text,text,text,text)
  IS 'Exact-client, designated-signer, current-version atomic client signature; never Harmonious execution.';