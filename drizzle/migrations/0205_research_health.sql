ALTER TABLE public.marketing_research_sources
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_item_count integer,
  ADD COLUMN IF NOT EXISTS last_invalid_dates integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_duration_ms integer,
  ADD COLUMN IF NOT EXISTS expected_interval_minutes integer NOT NULL DEFAULT 90;

CREATE TABLE IF NOT EXISTS public.marketing_research_health_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  subject_key text NOT NULL,
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  message text NOT NULL,
  occurrences integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  acknowledged_at timestamptz, acknowledged_by uuid,
  escalated_at timestamptz, escalated_by uuid,
  resolved_at timestamptz, resolved_by uuid, resolution_note text,
  auto_resolved boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS marketing_research_health_alerts_open
  ON public.marketing_research_health_alerts (kind, subject_key) WHERE resolved_at IS NULL;
GRANT ALL ON public.marketing_research_health_alerts TO service_role;
ALTER TABLE public.marketing_research_health_alerts ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.marketing_research_health_alerts IS 'Research monitoring alerts; read/written only via server functions (service role).';