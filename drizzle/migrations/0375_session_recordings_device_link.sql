ALTER TABLE public.session_recordings ADD COLUMN IF NOT EXISTS device_id text;
CREATE INDEX IF NOT EXISTS session_recordings_device_idx ON public.session_recordings (user_id, device_id);
COMMENT ON COLUMN public.session_recordings.device_id IS 'Same browser device id written by session evidence events, linking replays to login/session records.';