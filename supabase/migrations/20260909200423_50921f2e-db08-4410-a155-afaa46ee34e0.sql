ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS public_page_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_headline text,
  ADD COLUMN IF NOT EXISTS public_summary text;

CREATE TABLE IF NOT EXISTS public.fund_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  firm text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new',
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at timestamptz,
  internal_note text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'public_fund_page',
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fund_access_requests_offering_idx
  ON public.fund_access_requests (offering_id, created_at DESC);

GRANT SELECT, UPDATE ON public.fund_access_requests TO authenticated;
GRANT ALL ON public.fund_access_requests TO service_role;

ALTER TABLE public.fund_access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fund team reads access requests" ON public.fund_access_requests;
CREATE POLICY "fund team reads access requests"
  ON public.fund_access_requests FOR SELECT TO authenticated
  USING (public.can_manage_diligence(offering_id));

DROP POLICY IF EXISTS "fund team updates access requests" ON public.fund_access_requests;
CREATE POLICY "fund team updates access requests"
  ON public.fund_access_requests FOR UPDATE TO authenticated
  USING (public.can_manage_diligence(offering_id))
  WITH CHECK (public.can_manage_diligence(offering_id));

DROP TRIGGER IF EXISTS fund_access_requests_set_updated_at ON public.fund_access_requests;
CREATE TRIGGER fund_access_requests_set_updated_at BEFORE UPDATE ON public.fund_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();