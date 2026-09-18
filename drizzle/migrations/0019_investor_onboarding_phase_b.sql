-- Fund Administration Phase B: investor onboarding orchestration.
--
-- Why new tables are needed (nothing authoritative is duplicated here):
--   investor_applications is keyed to (user, offering) and carries no investment
--   profile, so the same person investing as Individual AND through an LLC in the
--   same fund cannot be represented. It also collapses requested / accepted /
--   funded / admitted amounts into one commitment field. This module adds the
--   orchestration record only and points at the existing authoritative records
--   (persons, investment profiles, entity verification, KYC/AML, accreditation,
--   tax profiles, applications, subscriptions, bank reconciliation, positions).

CREATE TABLE public.investor_onboardings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  investor_user_id UUID NOT NULL,
  person_id UUID,
  investment_profile_id UUID REFERENCES public.investment_profiles(id) ON DELETE SET NULL,
  application_id UUID REFERENCES public.investor_applications(id) ON DELETE SET NULL,
  invitation_id UUID REFERENCES public.fund_invitations(id) ON DELETE SET NULL,
  position_id UUID REFERENCES public.investor_positions(id) ON DELETE SET NULL,
  stage TEXT NOT NULL DEFAULT 'started',
  funding_status TEXT NOT NULL DEFAULT 'not_funded',
  requested_amount_cents BIGINT,
  accepted_amount_cents BIGINT,
  funded_amount_cents BIGINT NOT NULL DEFAULT 0,
  closed_amount_cents BIGINT,
  questionnaire_version INTEGER,
  questionnaire_responses JSONB NOT NULL DEFAULT '{}'::jsonb,
  document_template_version INTEGER,
  executed_snapshot JSONB,
  signature_id UUID,
  investor_reports_sent_at TIMESTAMPTZ,
  approved_to_fund_by UUID,
  approved_to_fund_at TIMESTAMPTZ,
  funding_released_at TIMESTAMPTZ,
  accepted_by UUID,
  accepted_at TIMESTAMPTZ,
  acceptance_capacity TEXT,
  closed_by UUID,
  closed_at TIMESTAMPTZ,
  assigned_to UUID,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX investor_onboardings_unique_profile
  ON public.investor_onboardings (offering_id, investor_user_id, investment_profile_id)
  WHERE investment_profile_id IS NOT NULL;
CREATE INDEX investor_onboardings_offering_idx ON public.investor_onboardings (offering_id, stage);
CREATE INDEX investor_onboardings_investor_idx ON public.investor_onboardings (investor_user_id);

CREATE TABLE public.investor_onboarding_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id UUID NOT NULL REFERENCES public.investor_onboardings(id) ON DELETE CASCADE,
  exception_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'blocking',
  owner TEXT NOT NULL DEFAULT 'harmonious',
  status TEXT NOT NULL DEFAULT 'open',
  detail TEXT,
  resolution TEXT,
  raised_by UUID,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX investor_onboarding_exceptions_idx
  ON public.investor_onboarding_exceptions (onboarding_id, status);

CREATE TABLE public.investor_onboarding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id UUID REFERENCES public.investor_onboardings(id) ON DELETE CASCADE,
  offering_id UUID,
  event TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  subject_table TEXT,
  subject_id UUID,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id UUID,
  actor_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX investor_onboarding_events_idx
  ON public.investor_onboarding_events (onboarding_id, created_at DESC);

CREATE TABLE public.offering_questionnaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  published_by UUID,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (offering_id, version)
);

ALTER TABLE public.fund_invitations ADD COLUMN IF NOT EXISTS intended_amount_cents BIGINT;
ALTER TABLE public.fund_invitations ADD COLUMN IF NOT EXISTS invitation_source TEXT;
ALTER TABLE public.fund_invitations ADD COLUMN IF NOT EXISTS onboarding_status TEXT;

GRANT SELECT, INSERT, UPDATE ON public.investor_onboardings TO authenticated;
GRANT ALL ON public.investor_onboardings TO service_role;
GRANT SELECT ON public.investor_onboarding_exceptions TO authenticated;
GRANT ALL ON public.investor_onboarding_exceptions TO service_role;
GRANT SELECT ON public.investor_onboarding_events TO authenticated;
GRANT ALL ON public.investor_onboarding_events TO service_role;
GRANT SELECT ON public.offering_questionnaires TO authenticated;
GRANT ALL ON public.offering_questionnaires TO service_role;

ALTER TABLE public.investor_onboardings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_onboarding_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_onboarding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offering_questionnaires ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read onboardings" ON public.investor_onboardings
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "investor reads own onboarding" ON public.investor_onboardings
  FOR SELECT TO authenticated USING (investor_user_id = auth.uid());
CREATE POLICY "manager reads fund onboardings" ON public.investor_onboardings
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.fund_managers fm
      WHERE fm.offering_id = investor_onboardings.offering_id AND fm.user_id = auth.uid()
    )
  );

CREATE POLICY "staff read onboarding exceptions" ON public.investor_onboarding_exceptions
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "investor reads own onboarding exceptions" ON public.investor_onboarding_exceptions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.investor_onboardings o
      WHERE o.id = investor_onboarding_exceptions.onboarding_id AND o.investor_user_id = auth.uid()
    )
  );

CREATE POLICY "staff read onboarding events" ON public.investor_onboarding_events
  FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE POLICY "staff read questionnaires" ON public.offering_questionnaires
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "published questionnaires readable" ON public.offering_questionnaires
  FOR SELECT TO authenticated USING (status = 'published');

-- Append-only onboarding audit trail.
CREATE OR REPLACE FUNCTION public.protect_investor_onboarding_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'investor onboarding events are append-only';
END;
$$;

CREATE TRIGGER investor_onboarding_events_append_only
  BEFORE UPDATE OR DELETE ON public.investor_onboarding_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_investor_onboarding_events();

-- A closed admission is settled: the investing profile, offering, executed
-- document snapshot and closed amount can never be quietly rewritten.
CREATE OR REPLACE FUNCTION public.protect_closed_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.stage = 'closed' THEN
    IF NEW.investment_profile_id IS DISTINCT FROM OLD.investment_profile_id
       OR NEW.offering_id IS DISTINCT FROM OLD.offering_id
       OR NEW.closed_amount_cents IS DISTINCT FROM OLD.closed_amount_cents
       OR NEW.executed_snapshot IS DISTINCT FROM OLD.executed_snapshot
       OR NEW.stage IS DISTINCT FROM OLD.stage THEN
      RAISE EXCEPTION 'a closed investment cannot be altered';
    END IF;
  END IF;
  IF OLD.executed_snapshot IS NOT NULL
     AND NEW.executed_snapshot IS DISTINCT FROM OLD.executed_snapshot THEN
    RAISE EXCEPTION 'an executed subscription snapshot cannot be rewritten';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER investor_onboardings_protect_closed
  BEFORE UPDATE ON public.investor_onboardings
  FOR EACH ROW EXECUTE FUNCTION public.protect_closed_onboarding();

CREATE TRIGGER investor_onboarding_exceptions_touch
  BEFORE UPDATE ON public.investor_onboarding_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER offering_questionnaires_touch
  BEFORE UPDATE ON public.offering_questionnaires
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
