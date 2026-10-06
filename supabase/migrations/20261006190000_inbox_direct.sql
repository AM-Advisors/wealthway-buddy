ALTER TABLE public.inbox_threads ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE public.inbox_threads ADD COLUMN IF NOT EXISTS participant_user_id uuid;
ALTER TABLE public.inbox_threads ADD COLUMN IF NOT EXISTS participant_kind text CHECK (participant_kind IN ('team','fund_manager','investor'));
ALTER TABLE public.inbox_threads DROP CONSTRAINT inbox_threads_channel_check;
ALTER TABLE public.inbox_threads ADD CONSTRAINT inbox_threads_channel_check CHECK (channel IN ('operations','sales','rep','direct'));
ALTER TABLE public.inbox_threads ADD CONSTRAINT inbox_threads_direct_check CHECK ((channel = 'direct') = (participant_user_id IS NOT NULL));
ALTER TABLE public.inbox_threads ADD CONSTRAINT inbox_threads_client_required CHECK (channel = 'direct' OR client_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS inbox_threads_participant_idx ON public.inbox_threads (participant_user_id, last_message_at DESC);
