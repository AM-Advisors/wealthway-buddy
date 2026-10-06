CREATE TABLE public.marketing_slack_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  channel text NOT NULL,
  ts text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, ts)
);
GRANT ALL ON public.marketing_slack_messages TO service_role;
ALTER TABLE public.marketing_slack_messages ENABLE ROW LEVEL SECURITY;