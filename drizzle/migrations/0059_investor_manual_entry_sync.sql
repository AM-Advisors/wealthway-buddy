-- Manual investor entry: a Person, Investment Profile and Investment may exist
-- before the investor has a sign-in account; they are claimed on verified sign-in.
ALTER TABLE public.investment_profiles ALTER COLUMN owner_user_id DROP NOT NULL;
ALTER TABLE public.investor_onboardings ALTER COLUMN investor_user_id DROP NOT NULL;
ALTER TABLE public.investment_profiles ADD CONSTRAINT investment_profiles_owner_or_person CHECK (owner_user_id IS NOT NULL OR person_id IS NOT NULL);
ALTER TABLE public.investor_onboardings ADD CONSTRAINT investor_onboardings_investor_or_person CHECK (investor_user_id IS NOT NULL OR person_id IS NOT NULL);

ALTER TABLE public.persons
  ADD COLUMN entry_source text NOT NULL DEFAULT 'investor',
  ADD COLUMN created_by uuid,
  ADD COLUMN mailing_address jsonb;
ALTER TABLE public.investment_profiles
  ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN entry_source text NOT NULL DEFAULT 'investor',
  ADD COLUMN created_by uuid;
ALTER TABLE public.investor_onboardings
  ADD COLUMN entry_source text NOT NULL DEFAULT 'investor',
  ADD COLUMN created_by uuid,
  ADD COLUMN commitment_amount_cents bigint,
  ADD COLUMN investment_date date,
  ADD COLUMN unit_count numeric,
  ADD COLUMN source_referral text,
  ADD COLUMN manager_notes text,
  ADD COLUMN internal_notes text,
  ADD COLUMN investor_confirmed_at timestamptz,
  ADD COLUMN removed_at timestamptz,
  ADD COLUMN removed_by uuid,
  ADD COLUMN removal_reason text;

-- One open investment per profile per fund, regardless of account state.
CREATE UNIQUE INDEX investor_onboardings_one_open_per_profile
  ON public.investor_onboardings (offering_id, investment_profile_id)
  WHERE investment_profile_id IS NOT NULL AND removed_at IS NULL AND stage NOT IN ('closed','declined','cancelled');
-- One open pre-account, unprofiled investment per person per fund.
CREATE UNIQUE INDEX investor_onboardings_one_open_person_unprofiled
  ON public.investor_onboardings (offering_id, person_id)
  WHERE investor_user_id IS NULL AND investment_profile_id IS NULL AND removed_at IS NULL AND stage NOT IN ('closed','declined','cancelled');
CREATE INDEX investment_profiles_person_idx ON public.investment_profiles (person_id);
CREATE INDEX investor_onboardings_person_idx ON public.investor_onboardings (person_id);

-- Append-only field-level provenance.
CREATE TABLE public.investor_record_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid,
  onboarding_id uuid,
  subject_table text NOT NULL,
  subject_id uuid NOT NULL,
  field text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  source text NOT NULL,
  actor_user_id uuid,
  manager_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.investor_record_changes TO service_role;
ALTER TABLE public.investor_record_changes ENABLE ROW LEVEL SECURITY;
CREATE INDEX investor_record_changes_onb_idx ON public.investor_record_changes (onboarding_id, created_at);
CREATE INDEX investor_record_changes_subject_idx ON public.investor_record_changes (subject_table, subject_id);
CREATE OR REPLACE FUNCTION public.block_investor_record_change_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'investor_record_changes is append-only'; END $$;
CREATE TRIGGER investor_record_changes_append_only BEFORE UPDATE OR DELETE ON public.investor_record_changes
  FOR EACH ROW EXECUTE FUNCTION public.block_investor_record_change_mutation();

-- Suggested updates and conflicts awaiting a reviewer; never auto-applied.
CREATE TABLE public.investor_record_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid,
  onboarding_id uuid,
  subject_table text NOT NULL,
  subject_id uuid,
  field text NOT NULL,
  current_value jsonb,
  proposed_value jsonb,
  source text NOT NULL,
  source_ref text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','rejected','review_later')),
  proposed_by uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.investor_record_suggestions TO service_role;
ALTER TABLE public.investor_record_suggestions ENABLE ROW LEVEL SECURITY;
CREATE INDEX investor_record_suggestions_onb_idx ON public.investor_record_suggestions (onboarding_id, status);
CREATE INDEX investor_record_suggestions_offering_idx ON public.investor_record_suggestions (offering_id, status);

-- Bulk import staging: nothing canonical is written until the preview is confirmed.
CREATE TABLE public.investor_bulk_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL,
  created_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'previewed' CHECK (status IN ('previewed','committed','cancelled')),
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  committed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.investor_bulk_imports TO service_role;
ALTER TABLE public.investor_bulk_imports ENABLE ROW LEVEL SECURITY;