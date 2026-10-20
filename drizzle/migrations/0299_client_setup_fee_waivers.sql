CREATE TABLE public.client_setup_fee_waivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 3),
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text
);
GRANT ALL ON public.client_setup_fee_waivers TO service_role;
ALTER TABLE public.client_setup_fee_waivers ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX client_setup_fee_waivers_one_active ON public.client_setup_fee_waivers(client_id) WHERE revoked_at IS NULL;

-- History is permanent: rows are never deleted, and only an active row may be revoked once.
CREATE OR REPLACE FUNCTION public.block_setup_fee_waiver_rewrite() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Setup fee waivers are permanent history.'; END IF;
  IF OLD.revoked_at IS NOT NULL OR NEW.client_id <> OLD.client_id OR NEW.reason <> OLD.reason
     OR NEW.granted_by <> OLD.granted_by OR NEW.granted_at <> OLD.granted_at THEN
    RAISE EXCEPTION 'Only revoking an active waiver is allowed.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_setup_fee_waivers_guard BEFORE UPDATE OR DELETE ON public.client_setup_fee_waivers
FOR EACH ROW EXECUTE FUNCTION public.block_setup_fee_waiver_rewrite();