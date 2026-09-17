-- Phase 2: canonical person, onboarding state machine, investment profiles,
-- profile relationships, entity/trust KYB, profile accreditation, offering
-- requirements and executed-record snapshots. Additive only.

DO $$ BEGIN
  CREATE TYPE public.onboarding_state AS ENUM (
    'account_created','profile_required','identity_required','kyc_pending','aml_pending',
    'verified','review_required','failed','reverification_required'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.investment_profile_type AS ENUM (
    'individual','joint','llc','corporation','partnership','trust','ira',
    'family_office','foundation','other_entity'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.profile_relationship_role AS ENUM (
    'owner','beneficial_owner','control_person','manager','member','officer','director',
    'trustee','grantor','authorized_signer','joint_owner','beneficiary'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. Canonical natural person -------------------------------------------
CREATE TABLE IF NOT EXISTS public.persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  legal_first_name text,
  legal_middle_name text,
  legal_last_name text,
  preferred_name text,
  date_of_birth date,
  citizenship_country text,
  residence_country text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country text,
  phone text,
  email text,
  tax_residency_country text,
  tax_id_last4 text,
  tax_id_reference text,
  kyc_status public.check_status NOT NULL DEFAULT 'not_started',
  aml_status public.check_status NOT NULL DEFAULT 'not_started',
  identity_verified_at timestamptz,
  kyc_verified_at timestamptz,
  aml_screened_at timestamptz,
  reverification_due_at timestamptz,
  onboarding_state public.onboarding_state NOT NULL DEFAULT 'account_created',
  onboarding_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS persons_email_idx ON public.persons (lower(email));

-- Restricted columns (date of birth, tax identifiers) are deliberately left
-- out of the authenticated grant: they are never readable by a browser client.
GRANT SELECT (
  id, user_id, legal_first_name, legal_middle_name, legal_last_name, preferred_name,
  citizenship_country, residence_country, address_line1, address_line2, city, region,
  postal_code, country, phone, email, tax_residency_country, tax_id_last4,
  kyc_status, aml_status, identity_verified_at, kyc_verified_at, aml_screened_at,
  reverification_due_at, onboarding_state, onboarding_reason, created_at, updated_at
) ON public.persons TO authenticated;
GRANT ALL ON public.persons TO service_role;
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;

-- 2. Onboarding history (append only) ------------------------------------
CREATE TABLE IF NOT EXISTS public.person_onboarding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  from_state public.onboarding_state,
  to_state public.onboarding_state NOT NULL,
  actor_user_id uuid,
  actor_kind text NOT NULL DEFAULT 'system',
  reason text,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS person_onboarding_events_person_idx
  ON public.person_onboarding_events (person_id, created_at DESC);

GRANT SELECT ON public.person_onboarding_events TO authenticated;
GRANT ALL ON public.person_onboarding_events TO service_role;
ALTER TABLE public.person_onboarding_events ENABLE ROW LEVEL SECURITY;

-- 3. Investment profiles --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.investment_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL,
  profile_type public.investment_profile_type NOT NULL,
  display_label text NOT NULL,
  legal_name text,
  status text NOT NULL DEFAULT 'draft',
  legacy_persona_id uuid UNIQUE REFERENCES public.investor_personas(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investment_profiles_owner_idx ON public.investment_profiles (owner_user_id);

GRANT SELECT ON public.investment_profiles TO authenticated;
GRANT INSERT (owner_user_id, person_id, profile_type, display_label, legal_name)
  ON public.investment_profiles TO authenticated;
GRANT UPDATE (display_label, legal_name) ON public.investment_profiles TO authenticated;
GRANT ALL ON public.investment_profiles TO service_role;
ALTER TABLE public.investment_profiles ENABLE ROW LEVEL SECURITY;

-- 4. People attached to a profile ----------------------------------------
CREATE TABLE IF NOT EXISTS public.investment_profile_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.investment_profiles(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  role public.profile_relationship_role NOT NULL,
  ownership_percent numeric(7,4),
  is_authorized_signer boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  verification_status public.check_status NOT NULL DEFAULT 'not_started',
  verified_at timestamptz,
  verified_by uuid,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, person_id, role)
);

CREATE INDEX IF NOT EXISTS ipr_profile_idx ON public.investment_profile_relationships (profile_id);
CREATE INDEX IF NOT EXISTS ipr_person_idx ON public.investment_profile_relationships (person_id);

GRANT SELECT ON public.investment_profile_relationships TO authenticated;
-- Verification columns and signer authority are never client-writable.
GRANT INSERT (profile_id, person_id, role, ownership_percent, added_by)
  ON public.investment_profile_relationships TO authenticated;
GRANT ALL ON public.investment_profile_relationships TO service_role;
ALTER TABLE public.investment_profile_relationships ENABLE ROW LEVEL SECURITY;

-- 5. Entity / trust verification (KYB) ------------------------------------
CREATE TABLE IF NOT EXISTS public.entity_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.investment_profiles(id) ON DELETE CASCADE,
  legal_name text,
  entity_type text,
  tax_id_last4 text,
  tax_id_reference text,
  formation_jurisdiction text,
  formation_date date,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country text,
  trust_type text,
  trust_date date,
  formation_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  beneficial_ownership jsonb NOT NULL DEFAULT '[]'::jsonb,
  kyb_status public.check_status NOT NULL DEFAULT 'not_started',
  entity_aml_status public.check_status NOT NULL DEFAULT 'not_started',
  submitted_at timestamptz,
  screened_at timestamptz,
  verified_at timestamptz,
  expires_at timestamptz,
  reviewer_id uuid,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT (
  id, profile_id, legal_name, entity_type, tax_id_last4, formation_jurisdiction,
  formation_date, address_line1, address_line2, city, region, postal_code, country,
  trust_type, trust_date, kyb_status, entity_aml_status, submitted_at, screened_at,
  verified_at, expires_at, review_notes, created_at, updated_at
) ON public.entity_verifications TO authenticated;
GRANT ALL ON public.entity_verifications TO service_role;
ALTER TABLE public.entity_verifications ENABLE ROW LEVEL SECURITY;

-- 6. Accreditation, attached to the investing profile ---------------------
CREATE TABLE IF NOT EXISTS public.profile_accreditations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.investment_profiles(id) ON DELETE CASCADE,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE CASCADE,
  status public.check_status NOT NULL DEFAULT 'not_started',
  basis text,
  verification_method text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  verifier_name text,
  verifier_kind text,
  verified_at timestamptz,
  expires_at timestamptz,
  legacy_record_id uuid REFERENCES public.accreditation_records(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS profile_accreditations_scope_idx
  ON public.profile_accreditations (profile_id, COALESCE(offering_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT ON public.profile_accreditations TO authenticated;
GRANT ALL ON public.profile_accreditations TO service_role;
ALTER TABLE public.profile_accreditations ENABLE ROW LEVEL SECURITY;

-- 7. Per-offering requirement configuration -------------------------------
CREATE TABLE IF NOT EXISTS public.offering_requirements (
  offering_id uuid PRIMARY KEY REFERENCES public.offerings(id) ON DELETE CASCADE,
  accreditation_required boolean NOT NULL DEFAULT true,
  accreditation_verification text NOT NULL DEFAULT 'self_attested',
  accreditation_max_age_days integer,
  requires_person_kyc boolean NOT NULL DEFAULT true,
  requires_person_aml boolean NOT NULL DEFAULT true,
  requires_entity_kyb boolean NOT NULL DEFAULT true,
  requires_control_person_kyc boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.offering_requirements TO authenticated;
GRANT ALL ON public.offering_requirements TO service_role;
ALTER TABLE public.offering_requirements ENABLE ROW LEVEL SECURITY;

-- 8. Immutable snapshots of the investing profile at execution ------------
CREATE TABLE IF NOT EXISTS public.investment_profile_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.investment_profiles(id) ON DELETE RESTRICT,
  application_id uuid REFERENCES public.investor_applications(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT 'subscription_executed',
  snapshot jsonb NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS ip_snapshots_profile_idx ON public.investment_profile_snapshots (profile_id, taken_at DESC);

GRANT SELECT ON public.investment_profile_snapshots TO authenticated;
GRANT ALL ON public.investment_profile_snapshots TO service_role;
ALTER TABLE public.investment_profile_snapshots ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_snapshot_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'investment profile snapshots are immutable';
END;
$$;

DROP TRIGGER IF EXISTS investment_profile_snapshots_immutable ON public.investment_profile_snapshots;
CREATE TRIGGER investment_profile_snapshots_immutable
  BEFORE UPDATE OR DELETE ON public.investment_profile_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.block_snapshot_rewrite();

-- 9. Visibility helpers ----------------------------------------------------
CREATE OR REPLACE FUNCTION private.person_is_self(_person_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private
AS $$
  SELECT EXISTS (SELECT 1 FROM public.persons p WHERE p.id = _person_id AND p.user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION private.owns_investment_profile(_profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.investment_profiles ip
    WHERE ip.id = _profile_id AND ip.owner_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION private.profile_visible(_profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.investment_profiles ip
    WHERE ip.id = _profile_id AND ip.owner_user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1
    FROM public.investment_profile_relationships r
    JOIN public.persons p ON p.id = r.person_id
    WHERE r.profile_id = _profile_id AND p.user_id = auth.uid() AND r.status = 'active'
  );
$$;

-- 10. Policies: read for the people concerned plus staff; writes are narrow.
DROP POLICY IF EXISTS "people read their own person record" ON public.persons;
CREATE POLICY "people read their own person record" ON public.persons
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "staff read person records" ON public.persons;
CREATE POLICY "staff read person records" ON public.persons
  FOR SELECT TO authenticated USING (public.is_any_staff());

DROP POLICY IF EXISTS "people read their onboarding history" ON public.person_onboarding_events;
CREATE POLICY "people read their onboarding history" ON public.person_onboarding_events
  FOR SELECT TO authenticated USING (private.person_is_self(person_id));

DROP POLICY IF EXISTS "staff read onboarding history" ON public.person_onboarding_events;
CREATE POLICY "staff read onboarding history" ON public.person_onboarding_events
  FOR SELECT TO authenticated USING (public.is_any_staff());

DROP POLICY IF EXISTS "people read their investment profiles" ON public.investment_profiles;
CREATE POLICY "people read their investment profiles" ON public.investment_profiles
  FOR SELECT TO authenticated USING (private.profile_visible(id));

DROP POLICY IF EXISTS "staff read investment profiles" ON public.investment_profiles;
CREATE POLICY "staff read investment profiles" ON public.investment_profiles
  FOR SELECT TO authenticated USING (public.is_any_staff());

DROP POLICY IF EXISTS "people create their own investment profiles" ON public.investment_profiles;
CREATE POLICY "people create their own investment profiles" ON public.investment_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_user_id = auth.uid()
    AND (person_id IS NULL OR private.person_is_self(person_id))
  );

DROP POLICY IF EXISTS "people rename their own investment profiles" ON public.investment_profiles;
CREATE POLICY "people rename their own investment profiles" ON public.investment_profiles
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid() AND status <> 'locked')
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "people read profile relationships" ON public.investment_profile_relationships;
CREATE POLICY "people read profile relationships" ON public.investment_profile_relationships
  FOR SELECT TO authenticated
  USING (private.profile_visible(profile_id) OR private.person_is_self(person_id));

DROP POLICY IF EXISTS "staff read profile relationships" ON public.investment_profile_relationships;
CREATE POLICY "staff read profile relationships" ON public.investment_profile_relationships
  FOR SELECT TO authenticated USING (public.is_any_staff());

-- A person may only attach themselves, and only to a profile they own.
-- Attaching anybody else is a controlled server workflow.
DROP POLICY IF EXISTS "people attach themselves to their own profile" ON public.investment_profile_relationships;
CREATE POLICY "people attach themselves to their own profile" ON public.investment_profile_relationships
  FOR INSERT TO authenticated
  WITH CHECK (private.owns_investment_profile(profile_id) AND private.person_is_self(person_id));

DROP POLICY IF EXISTS "people read their entity verification" ON public.entity_verifications;
CREATE POLICY "people read their entity verification" ON public.entity_verifications
  FOR SELECT TO authenticated USING (private.profile_visible(profile_id));

DROP POLICY IF EXISTS "staff read entity verification" ON public.entity_verifications;
CREATE POLICY "staff read entity verification" ON public.entity_verifications
  FOR SELECT TO authenticated USING (public.is_any_staff());

DROP POLICY IF EXISTS "people read their profile accreditation" ON public.profile_accreditations;
CREATE POLICY "people read their profile accreditation" ON public.profile_accreditations
  FOR SELECT TO authenticated USING (private.profile_visible(profile_id));

DROP POLICY IF EXISTS "staff read profile accreditation" ON public.profile_accreditations;
CREATE POLICY "staff read profile accreditation" ON public.profile_accreditations
  FOR SELECT TO authenticated USING (public.is_any_staff());

DROP POLICY IF EXISTS "authenticated read offering requirements" ON public.offering_requirements;
CREATE POLICY "authenticated read offering requirements" ON public.offering_requirements
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "people read their profile snapshots" ON public.investment_profile_snapshots;
CREATE POLICY "people read their profile snapshots" ON public.investment_profile_snapshots
  FOR SELECT TO authenticated USING (private.profile_visible(profile_id));

DROP POLICY IF EXISTS "staff read profile snapshots" ON public.investment_profile_snapshots;
CREATE POLICY "staff read profile snapshots" ON public.investment_profile_snapshots
  FOR SELECT TO authenticated USING (public.is_any_staff());

-- 11. Backfill: one canonical person per existing account ------------------
INSERT INTO public.persons (
  user_id, legal_first_name, legal_last_name, email, phone, date_of_birth,
  address_line1, address_line2, city, region, postal_code, country, residence_country
)
SELECT
  pr.user_id,
  NULLIF(split_part(COALESCE(pr.legal_name, ''), ' ', 1), ''),
  NULLIF(regexp_replace(COALESCE(pr.legal_name, ''), '^\S+\s*', ''), ''),
  pr.email, pr.phone, pr.date_of_birth,
  pr.address_line1, pr.address_line2, pr.city, pr.region, pr.postal_code, pr.country, pr.country
FROM public.profiles pr
WHERE pr.user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- Compliance state carried over from the strongest existing application.
UPDATE public.persons p
SET kyc_status = agg.kyc_status,
    aml_status = agg.aml_status,
    onboarding_state = CASE
      WHEN agg.kyc_status = 'approved' AND agg.aml_status = 'approved' THEN 'verified'::public.onboarding_state
      WHEN agg.kyc_status = 'declined' OR agg.aml_status = 'declined' THEN 'failed'::public.onboarding_state
      WHEN agg.kyc_status = 'review' OR agg.aml_status = 'review' THEN 'review_required'::public.onboarding_state
      WHEN agg.kyc_status = 'approved' THEN 'aml_pending'::public.onboarding_state
      WHEN agg.kyc_status <> 'not_started' THEN 'kyc_pending'::public.onboarding_state
      ELSE p.onboarding_state
    END
FROM (
  SELECT user_id,
         MAX(kyc_status::text) FILTER (WHERE kyc_status = 'approved') IS NOT NULL AS has_kyc,
         (CASE WHEN bool_or(kyc_status = 'approved') THEN 'approved'
               WHEN bool_or(kyc_status = 'review') THEN 'review'
               WHEN bool_or(kyc_status = 'declined') THEN 'declined'
               WHEN bool_or(kyc_status = 'pending') THEN 'pending'
               ELSE 'not_started' END)::public.check_status AS kyc_status,
         (CASE WHEN bool_or(aml_status = 'approved') THEN 'approved'
               WHEN bool_or(aml_status = 'review') THEN 'review'
               WHEN bool_or(aml_status = 'declined') THEN 'declined'
               WHEN bool_or(aml_status = 'pending') THEN 'pending'
               ELSE 'not_started' END)::public.check_status AS aml_status
  FROM public.investor_applications
  GROUP BY user_id
) agg
WHERE agg.user_id = p.user_id;

-- 12. Backfill: investment profiles from existing investing accounts -------
INSERT INTO public.investment_profiles (
  owner_user_id, person_id, profile_type, display_label, legal_name, status, legacy_persona_id
)
SELECT
  ip.user_id,
  CASE WHEN ip.kind = 'individual' THEN pe.id ELSE NULL END,
  (CASE ip.kind
     WHEN 'individual' THEN 'individual'
     WHEN 'joint' THEN 'joint'
     WHEN 'trust' THEN 'trust'
     WHEN 'ira' THEN 'ira'
     WHEN 'entity' THEN 'llc'
     ELSE 'other_entity' END)::public.investment_profile_type,
  COALESCE(NULLIF(ip.label, ''), NULLIF(ip.entity_name, ''), NULLIF(ip.legal_name, ''), 'Investment profile'),
  COALESCE(ip.entity_name, ip.legal_name),
  'active',
  ip.id
FROM public.investor_personas ip
LEFT JOIN public.persons pe ON pe.user_id = ip.user_id
ON CONFLICT (legacy_persona_id) DO NOTHING;

-- The account holder is the owner of every profile carried over.
INSERT INTO public.investment_profile_relationships (profile_id, person_id, role, added_by, status)
SELECT ipf.id, pe.id, 'owner', ipf.owner_user_id, 'active'
FROM public.investment_profiles ipf
JOIN public.persons pe ON pe.user_id = ipf.owner_user_id
ON CONFLICT (profile_id, person_id, role) DO NOTHING;

-- 13. Backfill: requirement configuration per existing offering ------------
INSERT INTO public.offering_requirements (
  offering_id, accreditation_required, accreditation_verification, requires_entity_kyb
)
SELECT o.id,
       o.reg_type <> 'regcf',
       CASE WHEN o.reg_type = '506c' THEN 'third_party_verified' ELSE 'self_attested' END,
       true
FROM public.offerings o
ON CONFLICT (offering_id) DO NOTHING;

-- 14. Backfill: accreditation history onto the investing profile -----------
INSERT INTO public.profile_accreditations (
  profile_id, offering_id, status, basis, verification_method, verified_at, expires_at, legacy_record_id
)
SELECT DISTINCT ON (ipf.id, app.offering_id)
  ipf.id, app.offering_id, ar.status, ar.method, ar.method, ar.verified_at, ar.expires_at, ar.id
FROM public.accreditation_records ar
JOIN public.investor_applications app ON app.id = ar.application_id
JOIN public.investment_profiles ipf ON ipf.legacy_persona_id = app.persona_id
ORDER BY ipf.id, app.offering_id, ar.created_at DESC
ON CONFLICT DO NOTHING;
