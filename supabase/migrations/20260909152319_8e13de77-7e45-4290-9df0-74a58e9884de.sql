CREATE TABLE public.email_opens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient text NOT NULL,
  template text,
  investor_email_id uuid REFERENCES public.investor_emails(id) ON DELETE SET NULL,
  application_id uuid REFERENCES public.investor_applications(id) ON DELETE SET NULL,
  user_agent text,
  opened_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.email_opens TO service_role;

ALTER TABLE public.email_opens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email opens"
ON public.email_opens FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
));

CREATE INDEX email_opens_recipient_idx ON public.email_opens (lower(recipient), opened_at DESC);
CREATE INDEX email_opens_template_idx ON public.email_opens (template, opened_at DESC);