ALTER TABLE public.offering_document_versions
  ADD COLUMN IF NOT EXISTS rollout_scope text CHECK (rollout_scope IN ('new_only','all','single')),
  ADD COLUMN IF NOT EXISTS target_onboarding_id uuid REFERENCES public.investor_onboardings(id),
  ADD COLUMN IF NOT EXISTS rollout_note text,
  ADD COLUMN IF NOT EXISTS rolled_out_by uuid,
  ADD COLUMN IF NOT EXISTS rolled_out_at timestamptz;

CREATE TABLE public.offering_document_resign_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  offering_document_id uuid NOT NULL REFERENCES public.offering_documents(id) ON DELETE CASCADE,
  onboarding_id uuid NOT NULL REFERENCES public.investor_onboardings(id) ON DELETE CASCADE,
  from_version integer,
  to_version integer NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','sent','signed','waived')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid,
  resolved_at timestamptz,
  UNIQUE (offering_document_id, onboarding_id, to_version)
);
GRANT ALL ON public.offering_document_resign_items TO service_role;
ALTER TABLE public.offering_document_resign_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.offering_document_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  offering_document_id uuid NOT NULL REFERENCES public.offering_documents(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size_bytes bigint NOT NULL DEFAULT 0,
  rollout_scope text NOT NULL CHECK (rollout_scope IN ('new_only','all','single')),
  target_onboarding_id uuid REFERENCES public.investor_onboardings(id),
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_version integer
);
GRANT ALL ON public.offering_document_change_requests TO service_role;
ALTER TABLE public.offering_document_change_requests ENABLE ROW LEVEL SECURITY;