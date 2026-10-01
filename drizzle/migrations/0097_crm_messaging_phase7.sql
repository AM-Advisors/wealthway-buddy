CREATE TABLE public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('harmonious','fund')),
  offering_id uuid REFERENCES public.offerings(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  organization text,
  title text,
  source text,
  tags text[] NOT NULL DEFAULT '{}',
  consent text NOT NULL DEFAULT 'unknown' CHECK (consent IN ('unknown','opted_in','unsubscribed')),
  consent_recorded_at timestamptz,
  consent_note text,
  archived_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'fund') = (offering_id IS NOT NULL))
);
CREATE INDEX crm_contacts_offering_idx ON public.crm_contacts(offering_id);
CREATE INDEX crm_contacts_owner_idx ON public.crm_contacts(owner_user_id);

CREATE TABLE public.crm_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('harmonious','fund')),
  offering_id uuid REFERENCES public.offerings(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE RESTRICT,
  title text NOT NULL,
  stage text NOT NULL DEFAULT 'lead' CHECK (stage IN ('lead','contacted','meeting','proposal','committed','won','lost')),
  amount_cents bigint CHECK (amount_cents IS NULL OR amount_cents >= 0),
  expected_close date,
  lost_reason text,
  archived_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'fund') = (offering_id IS NOT NULL))
);
CREATE INDEX crm_deals_offering_idx ON public.crm_deals(offering_id);
CREATE INDEX crm_deals_owner_idx ON public.crm_deals(owner_user_id);

CREATE TABLE public.crm_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('harmonious','fund')),
  offering_id uuid REFERENCES public.offerings(id) ON DELETE RESTRICT,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE RESTRICT,
  deal_id uuid REFERENCES public.crm_deals(id) ON DELETE RESTRICT,
  campaign_id uuid,
  actor_user_id uuid,
  kind text NOT NULL,
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_activity_offering_idx ON public.crm_activity(offering_id, created_at DESC);
CREATE INDEX crm_activity_contact_idx ON public.crm_activity(contact_id);

CREATE TABLE public.crm_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('harmonious','fund')),
  offering_id uuid REFERENCES public.offerings(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL,
  name text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','declined','sending','sent')),
  submitted_at timestamptz,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  sent_by uuid,
  sent_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'fund') = (offering_id IS NOT NULL))
);

CREATE TABLE public.crm_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.crm_campaigns(id) ON DELETE RESTRICT,
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE RESTRICT,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','suppressed','failed')),
  unsubscribe_token text NOT NULL UNIQUE,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, contact_id)
);

CREATE TABLE public.support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('manager','investor')),
  offering_id uuid REFERENCES public.offerings(id) ON DELETE RESTRICT,
  requester_user_id uuid NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'investor' OR offering_id IS NOT NULL)
);
CREATE INDEX support_conversations_requester_idx ON public.support_conversations(requester_user_id);
CREATE INDEX support_conversations_offering_idx ON public.support_conversations(offering_id);

CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE RESTRICT,
  sender_user_id uuid NOT NULL,
  side text NOT NULL CHECK (side IN ('participant','harmonious')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_messages_conv_idx ON public.support_messages(conversation_id, created_at);

CREATE TABLE public.message_reads (
  user_id uuid NOT NULL,
  thread_key text NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, thread_key)
);

GRANT ALL ON public.crm_contacts, public.crm_deals, public.crm_activity, public.crm_campaigns,
  public.crm_campaign_recipients, public.support_conversations, public.support_messages, public.message_reads TO service_role;

ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_phase7_history_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'This history is permanent and cannot be changed or deleted.';
END $$;

CREATE TRIGGER crm_activity_append_only BEFORE UPDATE OR DELETE ON public.crm_activity
  FOR EACH ROW EXECUTE FUNCTION public.block_phase7_history_mutation();
CREATE TRIGGER support_messages_append_only BEFORE UPDATE OR DELETE ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.block_phase7_history_mutation();
CREATE TRIGGER crm_contacts_no_delete BEFORE DELETE ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.block_phase7_history_mutation();
CREATE TRIGGER crm_deals_no_delete BEFORE DELETE ON public.crm_deals
  FOR EACH ROW EXECUTE FUNCTION public.block_phase7_history_mutation();
CREATE TRIGGER crm_campaigns_no_delete BEFORE DELETE ON public.crm_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.block_phase7_history_mutation();
CREATE TRIGGER crm_campaign_recipients_no_delete BEFORE DELETE ON public.crm_campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION public.block_phase7_history_mutation();

-- A sent campaign's content is frozen.
CREATE OR REPLACE FUNCTION public.protect_sent_campaign()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('approved','sending','sent') AND (NEW.subject IS DISTINCT FROM OLD.subject OR NEW.body IS DISTINCT FROM OLD.body OR NEW.audience IS DISTINCT FROM OLD.audience) THEN
    RAISE EXCEPTION 'An approved campaign''s content cannot change. Create a new campaign instead.';
  END IF;
  IF OLD.status = 'sent' AND NEW.status IS DISTINCT FROM 'sent' THEN
    RAISE EXCEPTION 'A sent campaign stays sent.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_campaigns_protect_sent BEFORE UPDATE ON public.crm_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.protect_sent_campaign();