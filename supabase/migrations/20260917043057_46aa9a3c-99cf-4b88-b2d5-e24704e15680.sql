CREATE TABLE IF NOT EXISTS public.plaid_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id text NOT NULL,
  webhook_type text NOT NULL,
  webhook_code text NOT NULL,
  body_sha256 text NOT NULL,
  key_id text,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'received',
  detail text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT plaid_webhook_deliveries_body_unique UNIQUE (body_sha256)
);

CREATE INDEX IF NOT EXISTS plaid_webhook_deliveries_item_idx
  ON public.plaid_webhook_deliveries (item_id, received_at DESC);
CREATE INDEX IF NOT EXISTS plaid_webhook_deliveries_status_idx
  ON public.plaid_webhook_deliveries (status, received_at DESC);

GRANT ALL ON public.plaid_webhook_deliveries TO service_role;
GRANT SELECT ON public.plaid_webhook_deliveries TO authenticated;

ALTER TABLE public.plaid_webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can review plaid webhook deliveries"
  ON public.plaid_webhook_deliveries
  FOR SELECT
  TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.get_bank_link_by_item(p_item_id text)
RETURNS TABLE (offering_id uuid, access_token text, created_by uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
    SELECT b.offering_id, b.access_token, b.created_by
    FROM private.bank_links b
    WHERE b.item_id = p_item_id
    LIMIT 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_bank_link_by_item(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_bank_link_by_item(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_bank_link_by_item(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_bank_link_by_item(text) TO service_role;