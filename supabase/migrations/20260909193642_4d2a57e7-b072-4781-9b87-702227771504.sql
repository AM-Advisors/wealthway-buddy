CREATE TABLE IF NOT EXISTS public.fund_valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  as_of_date date NOT NULL,
  nav_cents bigint NOT NULL DEFAULT 0,
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_id, as_of_date)
);

CREATE TABLE IF NOT EXISTS public.fund_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  paid_on date NOT NULL,
  amount_cents bigint NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'distribution',
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fund_valuations_offering_idx ON public.fund_valuations (offering_id, as_of_date);
CREATE INDEX IF NOT EXISTS fund_distributions_offering_idx ON public.fund_distributions (offering_id, paid_on);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_valuations TO authenticated;
GRANT ALL ON public.fund_valuations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_distributions TO authenticated;
GRANT ALL ON public.fund_distributions TO service_role;

ALTER TABLE public.fund_valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_distributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "valuations readable" ON public.fund_valuations;
CREATE POLICY "valuations readable"
  ON public.fund_valuations FOR SELECT TO authenticated
  USING (public.can_manage_diligence(offering_id) OR public.can_view_diligence(offering_id));

DROP POLICY IF EXISTS "valuations editable by fund team" ON public.fund_valuations;
CREATE POLICY "valuations editable by fund team"
  ON public.fund_valuations FOR ALL TO authenticated
  USING (public.can_manage_diligence(offering_id))
  WITH CHECK (public.can_manage_diligence(offering_id));

DROP POLICY IF EXISTS "distributions readable" ON public.fund_distributions;
CREATE POLICY "distributions readable"
  ON public.fund_distributions FOR SELECT TO authenticated
  USING (public.can_manage_diligence(offering_id) OR public.can_view_diligence(offering_id));

DROP POLICY IF EXISTS "distributions editable by fund team" ON public.fund_distributions;
CREATE POLICY "distributions editable by fund team"
  ON public.fund_distributions FOR ALL TO authenticated
  USING (public.can_manage_diligence(offering_id))
  WITH CHECK (public.can_manage_diligence(offering_id));

DROP TRIGGER IF EXISTS fund_valuations_set_updated_at ON public.fund_valuations;
CREATE TRIGGER fund_valuations_set_updated_at BEFORE UPDATE ON public.fund_valuations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS fund_distributions_set_updated_at ON public.fund_distributions;
CREATE TRIGGER fund_distributions_set_updated_at BEFORE UPDATE ON public.fund_distributions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();