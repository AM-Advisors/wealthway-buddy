CREATE TABLE public.marketing_drive_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_file_id text NOT NULL UNIQUE,
  name text NOT NULL,
  mime_type text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('image','sheet','video','other')),
  theme text,
  folder_path text NOT NULL DEFAULT '',
  web_view_link text,
  size_bytes bigint,
  drive_modified_at timestamptz,
  storage_path text,
  cached_modified_at timestamptz,
  removed_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_drive_assets_kind_idx ON public.marketing_drive_assets(kind, theme);
GRANT SELECT, INSERT, UPDATE ON public.marketing_drive_assets TO service_role;
ALTER TABLE public.marketing_drive_assets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.marketing_campaign_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.marketing_drive_assets(id) ON DELETE CASCADE,
  note text,
  added_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, asset_id)
);
GRANT SELECT, INSERT, DELETE ON public.marketing_campaign_assets TO service_role;
ALTER TABLE public.marketing_campaign_assets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.marketing_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  asset_id uuid NOT NULL REFERENCES public.marketing_drive_assets(id),
  audience text NOT NULL CHECK (audience IN ('client','prospect','investor','partner','other')),
  recipient_name text,
  recipient_email text,
  created_by uuid NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.marketing_share_links TO service_role;
ALTER TABLE public.marketing_share_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.marketing_share_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.marketing_share_links(id),
  user_agent text,
  viewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_share_views_link_idx ON public.marketing_share_views(link_id);
GRANT SELECT, INSERT ON public.marketing_share_views TO service_role;
ALTER TABLE public.marketing_share_views ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_marketing_share_view_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Share views are append-only.'; END $$;
CREATE TRIGGER marketing_share_views_immutable BEFORE UPDATE OR DELETE ON public.marketing_share_views FOR EACH ROW EXECUTE FUNCTION public.block_marketing_share_view_mutation();

ALTER TABLE public.marketing_emails ADD COLUMN IF NOT EXISTS attachment_asset_ids uuid[] NOT NULL DEFAULT '{}';