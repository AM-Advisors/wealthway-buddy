CREATE TABLE public.client_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  template text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  preview text,
  recipient_email text NOT NULL,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX client_messages_dedupe_idx
  ON public.client_messages (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX client_messages_user_created_idx
  ON public.client_messages (user_id, created_at DESC);

GRANT SELECT, UPDATE ON public.client_messages TO authenticated;
GRANT ALL ON public.client_messages TO service_role;

ALTER TABLE public.client_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipients read their own messages"
  ON public.client_messages FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Recipients mark their own messages read"
  ON public.client_messages FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());