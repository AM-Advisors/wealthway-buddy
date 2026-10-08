CREATE TABLE public.linkedin_personal_accounts (
  owner_user_id uuid PRIMARY KEY,
  member_sub text, name text, picture_url text, profile_url text,
  token_ciphertext text, expires_at timestamptz, scopes text,
  status text NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected','connected','reauthorization_required','disconnected')),
  connected_at timestamptz, last_authorized_at timestamptz, last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Explicit ownership: Alyssa Pettit's Harmonious staff account. Never inferred from name/email at runtime.
INSERT INTO public.linkedin_personal_accounts (owner_user_id) VALUES ('fcf83359-0486-402d-83b4-fd5484fb663d');
GRANT ALL ON public.linkedin_personal_accounts TO service_role;
ALTER TABLE public.linkedin_personal_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.linkedin_delegates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.linkedin_personal_accounts(owner_user_id),
  delegate_user_id uuid NOT NULL,
  perms jsonb NOT NULL DEFAULT '{}'::jsonb,
  direct_publish_authorized_at timestamptz,
  expires_at timestamptz, max_posts_per_day int, series text[], hours_start int, hours_end int,
  suspended boolean NOT NULL DEFAULT false, revoked_at timestamptz,
  updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, delegate_user_id)
);
GRANT ALL ON public.linkedin_delegates TO service_role;
ALTER TABLE public.linkedin_delegates ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.linkedin_personal_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.linkedin_personal_accounts(owner_user_id),
  author_id uuid NOT NULL, series_key text,
  body text NOT NULL, version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','changes_requested','approved','scheduled','publishing','published','failed','cancelled','rejected')),
  submitted_by uuid, approved_version int, approved_by uuid, approved_at timestamptz,
  scheduled_at timestamptz, scheduled_by uuid, publish_initiated_by uuid,
  idempotency_key text UNIQUE, linkedin_post_id text, published_at timestamptz, error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.linkedin_personal_posts TO service_role;
ALTER TABLE public.linkedin_personal_posts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.linkedin_personal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL, post_id uuid, delegate_user_id uuid,
  action text NOT NULL, actor_id uuid, version int, detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.linkedin_personal_events TO service_role;
ALTER TABLE public.linkedin_personal_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER lpe_append_only BEFORE UPDATE OR DELETE ON public.linkedin_personal_events FOR EACH ROW EXECUTE FUNCTION public.block_marketing_studio_history_mutation();