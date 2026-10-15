CREATE TABLE public.document_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_key text NOT NULL,
  client_id uuid,
  offering_id uuid,
  document_title text NOT NULL,
  recipient_email text NOT NULL,
  sent_by uuid NOT NULL,
  delivered boolean NOT NULL DEFAULT true,
  override_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.document_reminders TO authenticated;
GRANT ALL ON public.document_reminders TO service_role;
ALTER TABLE public.document_reminders ENABLE ROW LEVEL SECURITY;
CREATE INDEX document_reminders_key_idx ON public.document_reminders (reminder_key, created_at DESC);