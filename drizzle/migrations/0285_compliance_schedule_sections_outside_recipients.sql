ALTER TABLE public.compliance_report_schedules
  ADD COLUMN IF NOT EXISTS sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS outside_recipients jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.compliance_report_schedules.outside_recipients IS 'Non-harmonious.co recipients: [{email, reason, confirmed_by, confirmed_at}]; receive counts-only summary.';