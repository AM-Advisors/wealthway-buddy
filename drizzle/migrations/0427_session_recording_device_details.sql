ALTER TABLE public.session_recordings
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS last_ip_address text,
  ADD COLUMN IF NOT EXISTS client_info jsonb;
COMMENT ON COLUMN public.session_recordings.ip_address IS 'Network address seen by the server when the recording started';
COMMENT ON COLUMN public.session_recordings.last_ip_address IS 'Most recent network address seen while the recording was saved';
COMMENT ON COLUMN public.session_recordings.client_info IS 'Non-identifying browser facts reported at start: screen, window, time zone, language, touch, extended display';