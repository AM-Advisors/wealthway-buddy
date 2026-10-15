ALTER TABLE public.document_reminders
  ADD COLUMN IF NOT EXISTS message_id text,
  ADD COLUMN IF NOT EXISTS inbox_message_id uuid,
  ADD COLUMN IF NOT EXISTS recipient_user_id uuid,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounce_reason text,
  ADD COLUMN IF NOT EXISTS first_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS document_reminders_message_idx ON public.document_reminders (message_id);

CREATE TABLE public.email_tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text NOT NULL,
  event text NOT NULL,
  occurred_at timestamptz NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.email_tracking_events TO service_role;
ALTER TABLE public.email_tracking_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX email_tracking_events_msg_idx ON public.email_tracking_events (message_id);