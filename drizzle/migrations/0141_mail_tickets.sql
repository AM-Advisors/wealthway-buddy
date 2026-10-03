CREATE TABLE public.mail_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES public.staff_group_mailboxes(id) ON DELETE CASCADE,
  thread_id text NOT NULL,
  subject text NOT NULL DEFAULT '',
  from_email text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  assignee_user_id uuid,
  assigned_how text CHECK (assigned_how IN ('auto','manual')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting','resolved')),
  last_message_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mailbox_id, thread_id)
);
GRANT ALL ON public.mail_tickets TO service_role;
ALTER TABLE public.mail_tickets ENABLE ROW LEVEL SECURITY;
CREATE INDEX mail_tickets_assignee_idx ON public.mail_tickets (assignee_user_id, status);

CREATE TABLE public.mail_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.mail_tickets(id) ON DELETE CASCADE,
  actor_user_id uuid,
  kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.mail_ticket_events TO service_role;
ALTER TABLE public.mail_ticket_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX mail_ticket_events_ticket_idx ON public.mail_ticket_events (ticket_id, created_at);

CREATE OR REPLACE FUNCTION public.block_mail_ticket_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'mail_ticket_events is append-only'; END $$;
CREATE TRIGGER mail_ticket_events_append_only BEFORE UPDATE OR DELETE ON public.mail_ticket_events
  FOR EACH ROW EXECUTE FUNCTION public.block_mail_ticket_event_mutation();