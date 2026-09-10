CREATE TABLE public.fund_condition_clearances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('cleared','fee_ack')),
  reason text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fund_condition_clearances_offering_idx
  ON public.fund_condition_clearances (offering_id, rule_key, created_at DESC);

GRANT SELECT, INSERT ON public.fund_condition_clearances TO authenticated;
GRANT ALL ON public.fund_condition_clearances TO service_role;

ALTER TABLE public.fund_condition_clearances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contract authority can record clearances"
  ON public.fund_condition_clearances FOR INSERT TO authenticated
  WITH CHECK (private.can_manage_contracts(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Staff and fund people can read clearances"
  ON public.fund_condition_clearances FOR SELECT TO authenticated
  USING (
    private.is_staff(auth.uid())
    OR private.can_manage_contracts(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.fund_managers fm
      WHERE fm.offering_id = fund_condition_clearances.offering_id
        AND fm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.offerings o
      WHERE o.id = fund_condition_clearances.offering_id
        AND o.client_id IS NOT NULL
        AND private.client_visible(auth.uid(), o.client_id)
    )
  );