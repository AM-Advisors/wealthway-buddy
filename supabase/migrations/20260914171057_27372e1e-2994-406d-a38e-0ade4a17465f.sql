CREATE TABLE public.investor_signoffs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES public.investor_applications(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  fund_name text NOT NULL,
  commitment_cents bigint NOT NULL,
  share_price_cents bigint,
  acknowledgements jsonb NOT NULL DEFAULT '[]'::jsonb,
  signer_name text NOT NULL,
  signer_title text,
  signed_at timestamp with time zone NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (application_id, version)
);

CREATE INDEX investor_signoffs_application_idx ON public.investor_signoffs (application_id, version DESC);
CREATE INDEX investor_signoffs_offering_idx ON public.investor_signoffs (offering_id);

GRANT SELECT, INSERT ON public.investor_signoffs TO authenticated;
GRANT ALL ON public.investor_signoffs TO service_role;

ALTER TABLE public.investor_signoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Investors read their own sign-offs"
  ON public.investor_signoffs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Investors sign their own commitment"
  ON public.investor_signoffs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Fund staff read sign-offs"
  ON public.investor_signoffs FOR SELECT TO authenticated
  USING (public.can_manage_diligence(offering_id));

CREATE TRIGGER investor_signoffs_set_updated_at
  BEFORE UPDATE ON public.investor_signoffs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();