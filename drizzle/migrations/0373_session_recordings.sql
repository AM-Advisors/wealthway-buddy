CREATE TABLE public.session_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('replay','screen')),
  storage_prefix text NOT NULL,
  first_path text,
  last_path text,
  chunk_count integer NOT NULL DEFAULT 0,
  bytes bigint NOT NULL DEFAULT 0,
  note text,
  user_agent text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.session_recordings TO service_role;
ALTER TABLE public.session_recordings ENABLE ROW LEVEL SECURITY;
CREATE INDEX session_recordings_user_idx ON public.session_recordings (user_id, started_at DESC);
CREATE INDEX session_recordings_started_idx ON public.session_recordings (started_at DESC);
COMMENT ON TABLE public.session_recordings IS 'Support recordings (masked replays and user-started screen videos). Server-only access; leadership-only viewing.';