ALTER TABLE public.staff_activity_events DROP CONSTRAINT staff_activity_events_kind_check;
ALTER TABLE public.staff_activity_events ADD CONSTRAINT staff_activity_events_kind_check CHECK (kind = ANY (ARRAY['page'::text, 'action'::text, 'click'::text]));
CREATE INDEX IF NOT EXISTS staff_activity_events_user_created_idx ON public.staff_activity_events (user_id, created_at DESC);
COMMENT ON TABLE public.staff_activity_events IS 'Append-only page views, actions and clicks for every signed-in user (staff and clients).';