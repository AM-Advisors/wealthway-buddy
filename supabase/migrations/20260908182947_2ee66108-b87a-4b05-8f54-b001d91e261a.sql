CREATE TABLE public.funding_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.investor_applications(id) ON DELETE CASCADE,
  method funding_method NOT NULL,
  instructions_hash text NOT NULL,
  statements jsonb NOT NULL DEFAULT '[]'::jsonb,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX funding_ack_app_idx ON public.funding_acknowledgements (application_id, method, acknowledged_at DESC);

GRANT SELECT, INSERT ON public.funding_acknowledgements TO authenticated;
GRANT ALL ON public.funding_acknowledgements TO service_role;

ALTER TABLE public.funding_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Investors read own funding acknowledgements"
ON public.funding_acknowledgements FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.investor_applications a
  WHERE a.id = application_id AND a.user_id = auth.uid()
));

CREATE POLICY "Investors create own funding acknowledgements"
ON public.funding_acknowledgements FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.investor_applications a
  WHERE a.id = application_id AND a.user_id = auth.uid()
));

CREATE POLICY "Admins read funding acknowledgements"
ON public.funding_acknowledgements FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Fund managers read funding acknowledgements"
ON public.funding_acknowledgements FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.investor_applications a
  JOIN public.fund_managers fm ON fm.offering_id = a.offering_id
  WHERE a.id = application_id AND fm.user_id = auth.uid()
));