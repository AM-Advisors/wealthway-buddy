ALTER TABLE public.client_contacts ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.persons(id);

CREATE TABLE public.fund_signatories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  person_id uuid NOT NULL REFERENCES public.persons(id),
  client_contact_id uuid REFERENCES public.client_contacts(id),
  title text,
  capacity text,
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_by uuid,
  removed_at timestamptz
);
CREATE UNIQUE INDEX fund_signatories_active_person ON public.fund_signatories(offering_id, person_id) WHERE status = 'active';
CREATE UNIQUE INDEX fund_signatories_one_primary ON public.fund_signatories(offering_id) WHERE status = 'active' AND is_primary;

GRANT ALL ON public.fund_signatories TO service_role;
ALTER TABLE public.fund_signatories ENABLE ROW LEVEL SECURITY;

-- Backfill: the current single Fund Signatory becomes the primary row.
INSERT INTO public.fund_signatories (offering_id, person_id, title, capacity, is_primary)
SELECT id, fund_signatory_person_id, signatory_title, signatory_capacity, true
FROM public.offerings WHERE fund_signatory_person_id IS NOT NULL;