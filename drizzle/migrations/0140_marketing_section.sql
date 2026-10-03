CREATE TABLE public.marketing_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  image_paths text[] NOT NULL DEFAULT '{}',
  channels text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','scheduled','publishing','published','failed','rejected')),
  scheduled_at timestamptz,
  author_id uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.marketing_post_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.marketing_posts(id),
  channel text NOT NULL CHECK (channel IN ('linkedin','facebook','instagram')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','publishing','published','failed')),
  external_id text,
  error text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, channel)
);
CREATE TABLE public.marketing_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sources text[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.marketing_audience_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id uuid NOT NULL REFERENCES public.marketing_audiences(id),
  email text NOT NULL,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audience_id, email)
);
CREATE TABLE public.marketing_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL DEFAULT '',
  preheader text,
  blocks jsonb NOT NULL DEFAULT '[]',
  audience_id uuid REFERENCES public.marketing_audiences(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','scheduled','sending','sent','failed','rejected')),
  scheduled_at timestamptz,
  author_id uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.marketing_email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid NOT NULL REFERENCES public.marketing_emails(id),
  recipient text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent','skipped_unsubscribed','failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email_id, recipient)
);
CREATE TABLE public.marketing_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL CHECK (item_type IN ('post','email')),
  item_id uuid NOT NULL,
  action text NOT NULL,
  actor_id uuid NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.marketing_channels (
  channel text PRIMARY KEY CHECK (channel IN ('linkedin','facebook','instagram')),
  account_ref text,
  display_name text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.email_unsubscribes (
  email text PRIMARY KEY,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(18),'hex'),
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.block_marketing_approval_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'marketing approval history is append-only'; END $$;
CREATE TRIGGER marketing_approvals_append_only BEFORE UPDATE OR DELETE ON public.marketing_approvals FOR EACH ROW EXECUTE FUNCTION public.block_marketing_approval_mutation();

GRANT ALL ON public.marketing_posts, public.marketing_post_targets, public.marketing_audiences, public.marketing_audience_members, public.marketing_emails, public.marketing_email_sends, public.marketing_approvals, public.marketing_channels, public.email_unsubscribes TO service_role;
ALTER TABLE public.marketing_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_post_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_audience_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_email_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_unsubscribes ENABLE ROW LEVEL SECURITY;
CREATE INDEX marketing_posts_sched ON public.marketing_posts(status, scheduled_at);
CREATE INDEX marketing_emails_sched ON public.marketing_emails(status, scheduled_at);