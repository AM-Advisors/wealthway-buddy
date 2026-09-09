ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS signed_name text,
  ADD COLUMN IF NOT EXISTS confirmed_ip text,
  ADD COLUMN IF NOT EXISTS confirmed_user_agent text;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_application_id_key
  ON public.subscriptions (application_id);