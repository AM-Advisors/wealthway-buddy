ALTER TABLE public.distribution_batches
  ADD COLUMN IF NOT EXISTS basis_source text,
  ADD COLUMN IF NOT EXISTS basis_as_of date,
  ADD COLUMN IF NOT EXISTS basis_stale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS basis_stale_detail jsonb,
  ADD COLUMN IF NOT EXISTS basis_override_by uuid,
  ADD COLUMN IF NOT EXISTS basis_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS basis_override_reason text;
COMMENT ON COLUMN public.distribution_batches.basis_stale IS 'True when material capital activity exists after the allocation basis as-of date; final approval needs a newer basis or a reasoned independent override.';