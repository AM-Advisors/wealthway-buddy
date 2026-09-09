CREATE TABLE public.offering_packet_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT 'Investor packet',
  include_wire boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz,
  revoked_at timestamptz,
  download_count integer NOT NULL DEFAULT 0,
  last_downloaded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offering_packet_links TO authenticated;
GRANT ALL ON public.offering_packet_links TO service_role;

ALTER TABLE public.offering_packet_links ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_offering_packet_links_offering ON public.offering_packet_links(offering_id);

CREATE POLICY "Reviewers read packet links"
ON public.offering_packet_links FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.fund_managers m WHERE m.offering_id = offering_packet_links.offering_id AND m.user_id = auth.uid())
);

CREATE POLICY "Reviewers create packet links"
ON public.offering_packet_links FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.fund_managers m WHERE m.offering_id = offering_packet_links.offering_id AND m.user_id = auth.uid())
  )
);

CREATE POLICY "Reviewers update packet links"
ON public.offering_packet_links FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.fund_managers m WHERE m.offering_id = offering_packet_links.offering_id AND m.user_id = auth.uid())
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.fund_managers m WHERE m.offering_id = offering_packet_links.offering_id AND m.user_id = auth.uid())
);

CREATE TRIGGER update_offering_packet_links_updated_at
BEFORE UPDATE ON public.offering_packet_links
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.get_wire_instructions_for_packet(p_offering_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.details FROM private.offering_wire_instructions w WHERE w.offering_id = p_offering_id;
$$;

REVOKE ALL ON FUNCTION public.get_wire_instructions_for_packet(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_wire_instructions_for_packet(uuid) TO service_role;