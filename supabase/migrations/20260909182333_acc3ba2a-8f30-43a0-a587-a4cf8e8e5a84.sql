CREATE TABLE public.investor_cap_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES public.investor_applications(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  shares numeric,
  share_class text NOT NULL DEFAULT 'LP interest',
  ownership_pct_override numeric,
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.investor_cap_positions TO authenticated;
GRANT ALL ON public.investor_cap_positions TO service_role;

ALTER TABLE public.investor_cap_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage cap positions"
ON public.investor_cap_positions FOR ALL TO authenticated
USING (public.can_manage_diligence(offering_id))
WITH CHECK (public.can_manage_diligence(offering_id));

CREATE POLICY "Investors read their own position"
ON public.investor_cap_positions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.investor_applications a
  WHERE a.id = investor_cap_positions.application_id AND a.user_id = auth.uid()
));

CREATE INDEX investor_cap_positions_offering_idx ON public.investor_cap_positions(offering_id);

CREATE TRIGGER investor_cap_positions_updated_at
BEFORE UPDATE ON public.investor_cap_positions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();