CREATE TABLE public.offering_audit_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  offering_document_id uuid,
  event_type text NOT NULL,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text NOT NULL DEFAULT '',
  actor_id uuid NOT NULL,
  actor_email text,
  actor_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX offering_audit_events_offering_idx ON public.offering_audit_events (offering_id, created_at DESC);

GRANT SELECT, INSERT ON public.offering_audit_events TO authenticated;
GRANT ALL ON public.offering_audit_events TO service_role;

ALTER TABLE public.offering_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view fund audit events"
ON public.offering_audit_events
FOR SELECT
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can add fund audit events"
ON public.offering_audit_events
FOR INSERT
TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role) AND actor_id = auth.uid());