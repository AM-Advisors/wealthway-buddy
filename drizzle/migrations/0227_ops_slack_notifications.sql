ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS slack_user_id text;
CREATE TABLE public.ops_slack_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE,
  kind text NOT NULL,
  offering_id uuid,
  client_id uuid,
  tagged_user_id uuid,
  slack_ts text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ops_slack_notifications TO authenticated;
GRANT ALL ON public.ops_slack_notifications TO service_role;
ALTER TABLE public.ops_slack_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read ops slack notifications" ON public.ops_slack_notifications FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role::text IN ('admin','super_admin','operations','account_manager')));