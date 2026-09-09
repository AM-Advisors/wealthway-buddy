CREATE TABLE public.portal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.investor_applications(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('investor','manager','admin')),
  sender_name text,
  body text NOT NULL CHECK (length(btrim(body)) > 0 AND length(body) <= 5000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX portal_messages_app_idx ON public.portal_messages (application_id, created_at DESC);
CREATE INDEX portal_messages_offering_idx ON public.portal_messages (offering_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.portal_messages TO authenticated;
GRANT ALL ON public.portal_messages TO service_role;

ALTER TABLE public.portal_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Investors read their own thread"
ON public.portal_messages FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.investor_applications a
  WHERE a.id = portal_messages.application_id AND a.user_id = auth.uid()
));

CREATE POLICY "Investors write in their own thread"
ON public.portal_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND sender_role = 'investor'
  AND EXISTS (
    SELECT 1 FROM public.investor_applications a
    WHERE a.id = portal_messages.application_id
      AND a.user_id = auth.uid()
      AND a.offering_id = portal_messages.offering_id
  )
);

CREATE POLICY "Reviewers read fund threads"
ON public.portal_messages FOR SELECT TO authenticated
USING (public.can_manage_diligence(offering_id));

CREATE POLICY "Reviewers reply in fund threads"
ON public.portal_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND sender_role IN ('manager','admin')
  AND public.can_manage_diligence(offering_id)
);

CREATE POLICY "Participants mark messages read"
ON public.portal_messages FOR UPDATE TO authenticated
USING (
  public.can_manage_diligence(offering_id)
  OR EXISTS (
    SELECT 1 FROM public.investor_applications a
    WHERE a.id = portal_messages.application_id AND a.user_id = auth.uid()
  )
)
WITH CHECK (
  public.can_manage_diligence(offering_id)
  OR EXISTS (
    SELECT 1 FROM public.investor_applications a
    WHERE a.id = portal_messages.application_id AND a.user_id = auth.uid()
  )
);

CREATE TRIGGER portal_messages_updated
BEFORE UPDATE ON public.portal_messages
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();