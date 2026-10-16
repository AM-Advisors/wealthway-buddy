ALTER TABLE public.investor_applications
  ADD COLUMN IF NOT EXISTS commitment_status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS commitment_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS commitment_confirmed_at timestamptz;

ALTER TABLE public.investor_applications
  ADD CONSTRAINT investor_applications_commitment_status_check
  CHECK (commitment_status IN ('requested','confirmed'));

-- Any commitment amount written by a signed-in user (not the trusted server) is only a request
-- until staff or the fund manager confirm it through the server.
CREATE OR REPLACE FUNCTION public.investor_commitment_review_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.commitment_cents IS NOT NULL THEN NEW.commitment_status := 'requested'; END IF;
      NEW.commitment_confirmed_by := NULL; NEW.commitment_confirmed_at := NULL;
    ELSE
      IF NEW.commitment_cents IS DISTINCT FROM OLD.commitment_cents THEN
        NEW.commitment_status := 'requested';
        NEW.commitment_confirmed_by := NULL; NEW.commitment_confirmed_at := NULL;
      ELSE
        NEW.commitment_status := OLD.commitment_status;
        NEW.commitment_confirmed_by := OLD.commitment_confirmed_by;
        NEW.commitment_confirmed_at := OLD.commitment_confirmed_at;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS investor_commitment_review_guard ON public.investor_applications;
CREATE TRIGGER investor_commitment_review_guard
BEFORE INSERT OR UPDATE ON public.investor_applications
FOR EACH ROW EXECUTE FUNCTION public.investor_commitment_review_guard();