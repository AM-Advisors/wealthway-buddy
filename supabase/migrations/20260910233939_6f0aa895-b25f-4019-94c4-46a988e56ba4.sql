ALTER TABLE public.client_sows
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_note text;

ALTER TABLE public.client_sows DROP CONSTRAINT IF EXISTS client_sows_approval_status_check;
ALTER TABLE public.client_sows ADD CONSTRAINT client_sows_approval_status_check
  CHECK (approval_status IN ('pending','approved','rejected'));

UPDATE public.client_sows
   SET approval_status = 'approved', approved_at = COALESCE(approved_at, now())
 WHERE status = 'active' AND signed_on IS NOT NULL AND approval_status = 'pending';

CREATE INDEX IF NOT EXISTS client_sows_approval_status_idx ON public.client_sows (approval_status);