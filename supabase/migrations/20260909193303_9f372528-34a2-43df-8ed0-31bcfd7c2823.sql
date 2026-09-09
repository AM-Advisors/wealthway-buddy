CREATE TABLE IF NOT EXISTS public.offering_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  event_date date NOT NULL,
  event_time text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'milestone',
  status text NOT NULL DEFAULT 'scheduled',
  is_published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offering_timeline_events_offering_date_idx
  ON public.offering_timeline_events (offering_id, event_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offering_timeline_events TO authenticated;
GRANT ALL ON public.offering_timeline_events TO service_role;

ALTER TABLE public.offering_timeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "timeline readable" ON public.offering_timeline_events;
CREATE POLICY "timeline readable"
  ON public.offering_timeline_events
  FOR SELECT
  TO authenticated
  USING (
    public.can_manage_diligence(offering_id)
    OR (is_published AND public.can_view_diligence(offering_id))
  );

DROP POLICY IF EXISTS "timeline editable by fund team" ON public.offering_timeline_events;
CREATE POLICY "timeline editable by fund team"
  ON public.offering_timeline_events
  FOR ALL
  TO authenticated
  USING (public.can_manage_diligence(offering_id))
  WITH CHECK (public.can_manage_diligence(offering_id));

DROP TRIGGER IF EXISTS offering_timeline_events_set_updated_at ON public.offering_timeline_events;
CREATE TRIGGER offering_timeline_events_set_updated_at
  BEFORE UPDATE ON public.offering_timeline_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();