CREATE TABLE public.video_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id uuid NOT NULL REFERENCES public.session_recordings(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  include_camera boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.video_share_links TO service_role;
ALTER TABLE public.video_share_links ENABLE ROW LEVEL SECURITY;
CREATE INDEX video_share_links_recording_idx ON public.video_share_links (recording_id, created_at DESC);
CREATE UNIQUE INDEX video_share_links_one_active ON public.video_share_links (recording_id) WHERE revoked_at IS NULL;
COMMENT ON TABLE public.video_share_links IS 'One expiring link per screen video that anyone can open after typing a name and email. Server-only.';

CREATE TABLE public.video_share_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.video_share_links(id) ON DELETE CASCADE,
  recording_id uuid NOT NULL,
  viewer_name text NOT NULL,
  viewer_email text NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text
);
GRANT ALL ON public.video_share_views TO service_role;
ALTER TABLE public.video_share_views ENABLE ROW LEVEL SECURITY;
CREATE INDEX video_share_views_recording_idx ON public.video_share_views (recording_id, viewed_at DESC);
COMMENT ON TABLE public.video_share_views IS 'Each Watch press on a shared video link with the name and email the viewer typed (not verified). Email scanners opening the link are not counted.';

COMMENT ON TABLE public.recording_share_links IS 'DEPRECATED: replaced by video_share_links (one open link per video).';
COMMENT ON TABLE public.recording_share_views IS 'DEPRECATED: replaced by video_share_views.';