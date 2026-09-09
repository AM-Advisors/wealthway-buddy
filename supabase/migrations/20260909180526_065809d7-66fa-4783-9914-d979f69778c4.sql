ALTER TABLE public.investor_applications
  ADD COLUMN IF NOT EXISTS manager_review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS manager_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS manager_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS manager_review_notes text,
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz;

ALTER TABLE public.investor_applications
  DROP CONSTRAINT IF EXISTS investor_applications_manager_review_status_check;
ALTER TABLE public.investor_applications
  ADD CONSTRAINT investor_applications_manager_review_status_check
  CHECK (manager_review_status IN ('pending','approved','declined'));

CREATE INDEX IF NOT EXISTS investor_applications_manager_review_idx
  ON public.investor_applications (manager_review_status);