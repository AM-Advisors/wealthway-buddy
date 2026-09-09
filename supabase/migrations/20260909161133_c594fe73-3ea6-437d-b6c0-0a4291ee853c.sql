CREATE TABLE public.wire_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.investor_applications(id) ON DELETE SET NULL,
  requested_by uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  purpose text NOT NULL DEFAULT 'investor_wire',
  note text,
  expected_date date,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wire_requests_offering_idx ON public.wire_requests (offering_id, status);
CREATE INDEX wire_requests_status_idx ON public.wire_requests (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.wire_requests TO authenticated;
GRANT ALL ON public.wire_requests TO service_role;

ALTER TABLE public.wire_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers and admins can read wire requests"
ON public.wire_requests FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.fund_managers fm
    WHERE fm.offering_id = wire_requests.offering_id AND fm.user_id = auth.uid()
  )
);

CREATE POLICY "Managers can create wire requests for their funds"
ON public.wire_requests FOR INSERT TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.fund_managers fm
      WHERE fm.offering_id = wire_requests.offering_id AND fm.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Admins can decide wire requests"
ON public.wire_requests FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role));

CREATE TRIGGER wire_requests_set_updated_at
BEFORE UPDATE ON public.wire_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();