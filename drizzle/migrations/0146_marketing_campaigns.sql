CREATE TABLE public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  theme text,
  goal text,
  notes text,
  color text NOT NULL DEFAULT 'teal',
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  archived_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_campaigns_dates CHECK (ends_on >= starts_on)
);
GRANT ALL ON public.marketing_campaigns TO service_role;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_posts ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.marketing_emails ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS marketing_posts_campaign_idx ON public.marketing_posts(campaign_id);
CREATE INDEX IF NOT EXISTS marketing_emails_campaign_idx ON public.marketing_emails(campaign_id);
CREATE INDEX IF NOT EXISTS marketing_campaigns_dates_idx ON public.marketing_campaigns(starts_on, ends_on);