ALTER TABLE public.offerings ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_marked_by uuid,
  ADD COLUMN IF NOT EXISTS demo_marked_at timestamptz;
COMMENT ON COLUMN public.offerings.is_demo IS 'Display-only: hides the fund from the Operations Funds list and counts. Never changes access.';
UPDATE public.offerings SET is_demo = true, demo_marked_at = now() WHERE name ILIKE '%Walkthrough Fund%';