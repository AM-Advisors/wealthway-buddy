CREATE TABLE public.investor_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL,
  onboarding_id uuid NOT NULL,
  step text NOT NULL,
  sent_by uuid NOT NULL,
  recipient_email text,
  delivery text NOT NULL DEFAULT 'sent',
  delivery_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX investor_reminders_onboarding_idx ON public.investor_reminders (onboarding_id, created_at DESC);
GRANT ALL ON public.investor_reminders TO service_role;
ALTER TABLE public.investor_reminders ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_investor_reminder_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'investor_reminders is append-only'; END $$;
CREATE TRIGGER investor_reminders_append_only BEFORE UPDATE OR DELETE ON public.investor_reminders FOR EACH ROW EXECUTE FUNCTION public.block_investor_reminder_mutation();