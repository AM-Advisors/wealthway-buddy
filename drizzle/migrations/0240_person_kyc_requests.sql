CREATE TABLE public.person_kyc_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('link','document')),
  document_type text,
  session_id text,
  session_url text,
  status text NOT NULL DEFAULT 'sent',
  id_status text,
  aml_status text,
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX person_kyc_requests_person_idx ON public.person_kyc_requests(person_id);
GRANT ALL ON public.person_kyc_requests TO service_role;
ALTER TABLE public.person_kyc_requests ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.person_kyc_requests IS 'Staff-started Didit checks (link or document-only). ID images are never stored. Server functions only.';