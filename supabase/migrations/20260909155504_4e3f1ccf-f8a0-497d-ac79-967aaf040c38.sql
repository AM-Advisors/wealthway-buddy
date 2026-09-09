ALTER TABLE public.diligence_rooms
  ADD COLUMN IF NOT EXISTS nda_box_file_id text,
  ADD COLUMN IF NOT EXISTS nda_file_name text,
  ADD COLUMN IF NOT EXISTS nda_signing_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.diligence_nda_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.diligence_rooms(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nda_version integer NOT NULL DEFAULT 1,
  signer_name text NOT NULL,
  signer_email text NOT NULL,
  source_box_file_id text,
  sign_request_id text UNIQUE,
  status text NOT NULL DEFAULT 'out_for_signature',
  signing_url text,
  sent_at timestamptz,
  viewed_at timestamptz,
  completed_at timestamptz,
  signed_box_file_id text,
  signed_file_name text,
  signed_pdf_path text,
  document_hash text,
  manager_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS diligence_nda_signatures_unique
  ON public.diligence_nda_signatures (room_id, user_id, nda_version);
CREATE INDEX IF NOT EXISTS diligence_nda_signatures_offering_idx
  ON public.diligence_nda_signatures (offering_id);

GRANT SELECT ON public.diligence_nda_signatures TO authenticated;
GRANT ALL ON public.diligence_nda_signatures TO service_role;

ALTER TABLE public.diligence_nda_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Investors read their own NDA signature"
  ON public.diligence_nda_signatures FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Reviewers read NDA signatures for their funds"
  ON public.diligence_nda_signatures FOR SELECT TO authenticated
  USING (public.can_manage_diligence(offering_id));

CREATE TRIGGER diligence_nda_signatures_updated
  BEFORE UPDATE ON public.diligence_nda_signatures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();