CREATE TABLE public.recording_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id uuid NOT NULL REFERENCES public.session_recordings(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  recipient_name text NOT NULL,
  recipient_email text NOT NULL,
  include_camera boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.recording_share_links TO service_role;
ALTER TABLE public.recording_share_links ENABLE ROW LEVEL SECURITY;
CREATE INDEX recording_share_links_recording_idx ON public.recording_share_links (recording_id, created_at DESC);
CREATE UNIQUE INDEX recording_share_links_one_active ON public.recording_share_links (recording_id, recipient_email) WHERE revoked_at IS NULL;
COMMENT ON TABLE public.recording_share_links IS 'Personal, expiring links to watch one screen video without signing in. Token stored only as a hash. Server-only.';

CREATE TABLE public.recording_share_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.recording_share_links(id) ON DELETE CASCADE,
  recording_id uuid NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text
);
GRANT ALL ON public.recording_share_views TO service_role;
ALTER TABLE public.recording_share_views ENABLE ROW LEVEL SECURITY;
CREATE INDEX recording_share_views_link_idx ON public.recording_share_views (link_id, viewed_at DESC);
COMMENT ON TABLE public.recording_share_views IS 'Each press of Watch on a shared video link: when, network address, device. Email scanners opening the link are not counted.';