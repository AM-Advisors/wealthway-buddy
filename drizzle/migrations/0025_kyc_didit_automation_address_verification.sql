-- KYC/AML: Didit automation, distinct check results and address verification.
-- Additive only. Harmonious stays authoritative; Didit results are recorded
-- separately from the Harmonious compliance decision.

DO $$ BEGIN
  CREATE TYPE public.address_verification_state AS ENUM (
    'entered','normalized','validated','proof_required','proof_pending',
    'proof_verified','review_required','failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.identity_check_kind AS ENUM (
    'identity','document','liveness','face_match','address','proof_of_address','aml'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. Provider-authoritative fields on the existing verification record -------
ALTER TABLE public.kyc_verifications
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verification_ref uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS workflow_id text,
  ADD COLUMN IF NOT EXISTS prefill_sent jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS document_issuing_country text,
  ADD COLUMN IF NOT EXISTS document_issuing_region text,
  ADD COLUMN IF NOT EXISTS document_issue_date date,
  ADD COLUMN IF NOT EXISTS document_expiration_date date,
  ADD COLUMN IF NOT EXISTS document_number_last4 text,
  ADD COLUMN IF NOT EXISTS document_expired boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_full_name text,
  ADD COLUMN IF NOT EXISTS verified_date_of_birth date,
  ADD COLUMN IF NOT EXISTS liveness_status public.check_status NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS face_match_status public.check_status NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS face_match_score numeric(6,3),
  ADD COLUMN IF NOT EXISTS address_check_status public.check_status NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS proof_of_address_status public.check_status NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS provider_decision text,
  ADD COLUMN IF NOT EXISTS provider_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS harmonious_decision public.check_status NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS harmonious_decision_reason text,
  ADD COLUMN IF NOT EXISTS verification_completed_on date,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS kyc_verifications_ref_idx
  ON public.kyc_verifications (verification_ref);
CREATE INDEX IF NOT EXISTS kyc_verifications_person_idx
  ON public.kyc_verifications (person_id);
CREATE INDEX IF NOT EXISTS kyc_verifications_session_idx
  ON public.kyc_verifications (session_id);

COMMENT ON COLUMN public.kyc_verifications.verification_ref IS
  'Opaque Harmonious correlation id sent to Didit as vendor_data. Email is never authoritative for correlation.';
COMMENT ON COLUMN public.kyc_verifications.provider_decision IS
  'Didit provider decision, deliberately distinct from harmonious_decision.';

-- 2. One row per underlying check (never collapsed into one boolean) --------
CREATE TABLE IF NOT EXISTS public.identity_check_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id uuid NOT NULL REFERENCES public.kyc_verifications(id) ON DELETE CASCADE,
  person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL,
  check_kind public.identity_check_kind NOT NULL,
  provider text NOT NULL DEFAULT 'didit',
  provider_status text,
  harmonious_status public.check_status NOT NULL DEFAULT 'not_started',
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (verification_id, check_kind)
);

CREATE INDEX IF NOT EXISTS identity_check_results_person_idx
  ON public.identity_check_results (person_id);

GRANT SELECT ON public.identity_check_results TO authenticated;
GRANT ALL ON public.identity_check_results TO service_role;
ALTER TABLE public.identity_check_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read identity check results" ON public.identity_check_results
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

CREATE POLICY "people read their own identity check results" ON public.identity_check_results
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = identity_check_results.person_id AND p.user_id = auth.uid()
    )
  );

-- 3. Structured, evidence-backed addresses ---------------------------------
CREATE TABLE IF NOT EXISTS public.person_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  address_kind text NOT NULL DEFAULT 'residential',
  line1 text NOT NULL,
  line2 text,
  city text,
  region text,
  postal_code text,
  country text NOT NULL,
  formatted text,
  entry_method text NOT NULL DEFAULT 'manual',
  validation_provider text,
  validation_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  state public.address_verification_state NOT NULL DEFAULT 'entered',
  state_reason text,
  provider_extracted_address jsonb,
  match_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  proof_document_type text,
  proof_issue_date date,
  proof_provider_status text,
  proof_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  proof_verified_at timestamptz,
  verification_id uuid REFERENCES public.kyc_verifications(id) ON DELETE SET NULL,
  is_current boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS person_addresses_person_idx
  ON public.person_addresses (person_id, is_current);

COMMENT ON TABLE public.person_addresses IS
  'Address states carry their own evidence; autocomplete success alone never means proof of residence.';

-- Read-only to browsers: every state change is written server-side.
GRANT SELECT ON public.person_addresses TO authenticated;
GRANT ALL ON public.person_addresses TO service_role;
ALTER TABLE public.person_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read person addresses" ON public.person_addresses
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

CREATE POLICY "people read their own addresses" ON public.person_addresses
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_addresses.person_id AND p.user_id = auth.uid()
    )
  );

-- 4. Append-only address evidence trail ------------------------------------
CREATE TABLE IF NOT EXISTS public.address_verification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address_id uuid NOT NULL REFERENCES public.person_addresses(id) ON DELETE CASCADE,
  person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL,
  from_state public.address_verification_state,
  to_state public.address_verification_state NOT NULL,
  source text NOT NULL DEFAULT 'system',
  actor_user_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS address_verification_events_address_idx
  ON public.address_verification_events (address_id, created_at DESC);

GRANT SELECT ON public.address_verification_events TO authenticated;
GRANT ALL ON public.address_verification_events TO service_role;
ALTER TABLE public.address_verification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read address verification events" ON public.address_verification_events
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

CREATE POLICY "people read their own address events" ON public.address_verification_events
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = address_verification_events.person_id AND p.user_id = auth.uid()
    )
  );
