ALTER TABLE public.ct_migrations
  ADD COLUMN IF NOT EXISTS file_kind text NOT NULL DEFAULT 'shareholders',
  ADD COLUMN IF NOT EXISTS bundle_id uuid;

CREATE INDEX IF NOT EXISTS ct_migrations_bundle_id_idx ON public.ct_migrations (bundle_id);