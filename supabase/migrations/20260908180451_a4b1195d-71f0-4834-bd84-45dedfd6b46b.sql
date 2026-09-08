CREATE TABLE IF NOT EXISTS public.email_link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  template text,
  link_label text,
  target_url text NOT NULL,
  investor_email_id uuid REFERENCES public.investor_emails(id) ON DELETE SET NULL,
  user_agent text,
  clicked_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_link_clicks TO authenticated;
GRANT ALL ON public.email_link_clicks TO service_role;

ALTER TABLE public.email_link_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read email link clicks"
  ON public.email_link_clicks FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS email_link_clicks_recipient_idx
  ON public.email_link_clicks (recipient, clicked_at DESC);