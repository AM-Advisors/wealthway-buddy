ALTER TABLE public.marketing_post_targets DROP CONSTRAINT IF EXISTS marketing_post_targets_status_check;
ALTER TABLE public.marketing_post_targets ADD CONSTRAINT marketing_post_targets_status_check CHECK (status IN ('pending','publishing','submitted','published','failed','test_passed'));
ALTER TABLE public.marketing_post_targets ADD COLUMN IF NOT EXISTS permalink text, ADD COLUMN IF NOT EXISTS confirmed_at timestamptz, ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS mode text;

CREATE TABLE public.marketing_publishing_mode (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  mode text NOT NULL DEFAULT 'test' CHECK (mode IN ('test','live')),
  requested_by uuid, requested_at timestamptz, request_reason text,
  approved_by uuid, approved_at timestamptz, approval_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.marketing_publishing_mode (id, mode) VALUES (1, 'test');
GRANT ALL ON public.marketing_publishing_mode TO service_role;
ALTER TABLE public.marketing_publishing_mode ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.marketing_publish_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.marketing_posts(id),
  target_id uuid REFERENCES public.marketing_post_targets(id),
  channel text NOT NULL, mode text NOT NULL, action text NOT NULL,
  result text NOT NULL, external_id text, permalink text, error text,
  actor_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.marketing_publish_attempts TO service_role;
ALTER TABLE public.marketing_publish_attempts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER mpa_append_only BEFORE UPDATE OR DELETE ON public.marketing_publish_attempts FOR EACH ROW EXECUTE FUNCTION public.block_marketing_studio_history_mutation();

CREATE TABLE public.marketing_post_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL REFERENCES public.marketing_post_targets(id),
  captured_on date NOT NULL,
  metrics jsonb NOT NULL,
  unavailable text[] NOT NULL DEFAULT '{}',
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_id, captured_on)
);
GRANT ALL ON public.marketing_post_metrics TO service_role;
ALTER TABLE public.marketing_post_metrics ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.marketing_search_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  site_url text, chosen_by uuid, chosen_at timestamptz, last_refresh_at timestamptz, last_error text
);
INSERT INTO public.marketing_search_settings (id) VALUES (1);
GRANT ALL ON public.marketing_search_settings TO service_role;
ALTER TABLE public.marketing_search_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.marketing_search_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_url text NOT NULL, day date NOT NULL, page text NOT NULL, query text NOT NULL,
  clicks int NOT NULL, impressions int NOT NULL, ctr numeric NOT NULL, position numeric NOT NULL,
  UNIQUE (site_url, day, page, query)
);
GRANT ALL ON public.marketing_search_rows TO service_role;
ALTER TABLE public.marketing_search_rows ENABLE ROW LEVEL SECURITY;