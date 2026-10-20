CREATE TABLE public.investor_email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL,
  offering_id uuid NOT NULL,
  kind text NOT NULL,
  subject text,
  recipient_email text NOT NULL,
  message_id text,
  sent_by uuid,
  outcome text NOT NULL DEFAULT 'sent',
  note text,
  source text NOT NULL DEFAULT 'platform',
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX investor_email_sends_msg_uniq ON public.investor_email_sends (onboarding_id, message_id) WHERE message_id IS NOT NULL;
CREATE INDEX investor_email_sends_onb ON public.investor_email_sends (onboarding_id, sent_at DESC);
GRANT ALL ON public.investor_email_sends TO service_role;
ALTER TABLE public.investor_email_sends ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_investor_email_send_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Email send history is permanent'; END $$;
CREATE TRIGGER investor_email_sends_immutable BEFORE UPDATE OR DELETE ON public.investor_email_sends FOR EACH ROW EXECUTE FUNCTION public.block_investor_email_send_mutation();

CREATE TABLE public.onboarding_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL,
  offering_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('preparer','signer')),
  full_name text NOT NULL,
  email text NOT NULL,
  title text,
  user_id uuid,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','removed')),
  assigned_by uuid NOT NULL,
  assigned_by_role text NOT NULL,
  removed_at timestamptz,
  removed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX onboarding_participants_onb ON public.onboarding_participants (onboarding_id);
CREATE INDEX onboarding_participants_email ON public.onboarding_participants (lower(email));
GRANT ALL ON public.onboarding_participants TO service_role;
ALTER TABLE public.onboarding_participants ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.guard_onboarding_participant() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Participants are removed, never deleted'; END IF;
  IF OLD.status = 'removed' THEN RAISE EXCEPTION 'A removed participant cannot be changed'; END IF;
  IF NEW.onboarding_id <> OLD.onboarding_id OR NEW.role <> OLD.role OR lower(NEW.email) <> lower(OLD.email) OR NEW.assigned_by <> OLD.assigned_by THEN
    RAISE EXCEPTION 'Participant assignment is fixed; remove and assign again';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER onboarding_participants_guard BEFORE UPDATE OR DELETE ON public.onboarding_participants FOR EACH ROW EXECUTE FUNCTION public.guard_onboarding_participant();