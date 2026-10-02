CREATE TABLE public.inbox_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('operations','sales','rep')),
  rep_user_id uuid,
  subject text NOT NULL,
  created_by uuid NOT NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((channel = 'rep') = (rep_user_id IS NOT NULL))
);
GRANT ALL ON public.inbox_threads TO service_role;
ALTER TABLE public.inbox_threads ENABLE ROW LEVEL SECURITY;
CREATE INDEX inbox_threads_client_idx ON public.inbox_threads(client_id, last_message_at DESC);

CREATE TABLE public.inbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  sender_side text NOT NULL CHECK (sender_side IN ('client','harmonious')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.inbox_messages TO service_role;
ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX inbox_messages_thread_idx ON public.inbox_messages(thread_id, created_at);

CREATE OR REPLACE FUNCTION public.block_inbox_message_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'inbox messages are append-only'; END $$;
CREATE TRIGGER inbox_messages_append_only BEFORE UPDATE OR DELETE ON public.inbox_messages
FOR EACH ROW EXECUTE FUNCTION public.block_inbox_message_mutation();

CREATE TABLE public.inbox_read_markers (
  user_id uuid NOT NULL,
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, thread_id)
);
GRANT ALL ON public.inbox_read_markers TO service_role;
ALTER TABLE public.inbox_read_markers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.view_as_sessions ADD COLUMN IF NOT EXISTS preview boolean NOT NULL DEFAULT false;