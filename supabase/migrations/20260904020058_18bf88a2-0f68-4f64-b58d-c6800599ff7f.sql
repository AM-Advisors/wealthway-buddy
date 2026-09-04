CREATE TABLE public.investor_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.investor_applications(id) ON DELETE CASCADE,
  sent_by uuid NOT NULL,
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  provider_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.investor_emails TO authenticated;
GRANT ALL ON public.investor_emails TO service_role;

ALTER TABLE public.investor_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage investor emails" ON public.investor_emails
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER investor_emails_updated
  BEFORE UPDATE ON public.investor_emails
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX investor_emails_application_idx ON public.investor_emails(application_id, created_at DESC);