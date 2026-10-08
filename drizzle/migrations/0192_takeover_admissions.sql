ALTER TABLE public.investor_positions ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'harmonious_onboarded';
ALTER TABLE public.investor_positions ADD CONSTRAINT investor_positions_origin_chk CHECK (origin IN ('harmonious_onboarded','takeover_prior_administrator','historical_import','other_approved_migration'));

CREATE TABLE public.investor_takeover_admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL,
  position_id uuid NOT NULL REFERENCES public.investor_positions(id),
  batch_ref text NOT NULL,
  origin text NOT NULL CHECK (origin IN ('takeover_prior_administrator','historical_import','other_approved_migration')),
  source_system text NOT NULL,
  as_of_date date NOT NULL,
  relationship_effective_date date,
  investor_name text NOT NULL,
  investor_type text,
  class_label text,
  commitment_cents bigint NOT NULL CHECK (commitment_cents >= 0),
  called_cents bigint NOT NULL CHECK (called_cents >= 0),
  contributed_cents bigint NOT NULL CHECK (contributed_cents >= 0),
  opening_capital_cents bigint NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  compliance jsonb NOT NULL DEFAULT '{}'::jsonb,
  remediation jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','evidence_review','approval_required','admitted','rejected','remediation_required','superseded')),
  notes text,
  prepared_by uuid NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT takeover_decider_differs CHECK (decided_by IS NULL OR decided_by <> prepared_by)
);
CREATE UNIQUE INDEX investor_takeover_admissions_one_live ON public.investor_takeover_admissions(position_id) WHERE status NOT IN ('rejected','superseded');
CREATE UNIQUE INDEX investor_takeover_admissions_batch ON public.investor_takeover_admissions(position_id, batch_ref);
GRANT ALL ON public.investor_takeover_admissions TO service_role;
ALTER TABLE public.investor_takeover_admissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.investor_takeover_admission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id uuid NOT NULL REFERENCES public.investor_takeover_admissions(id),
  offering_id uuid NOT NULL,
  action text NOT NULL,
  actor_user_id uuid NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.investor_takeover_admission_events TO service_role;
ALTER TABLE public.investor_takeover_admission_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_takeover_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Takeover admission events are append-only'; END $$;
CREATE TRIGGER takeover_events_append_only BEFORE UPDATE OR DELETE ON public.investor_takeover_admission_events FOR EACH ROW EXECUTE FUNCTION public.block_takeover_event_mutation();

CREATE OR REPLACE FUNCTION public.guard_takeover_admission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Takeover admissions are never deleted; reject or supersede instead'; END IF;
  IF OLD.status IN ('admitted','rejected','superseded') AND NEW.status = OLD.status THEN RAISE EXCEPTION 'A decided takeover admission cannot be edited'; END IF;
  IF OLD.status = 'admitted' AND NEW.status <> 'superseded' THEN RAISE EXCEPTION 'An admitted takeover can only be superseded'; END IF;
  IF OLD.status IN ('admitted','superseded','rejected') AND (NEW.commitment_cents <> OLD.commitment_cents OR NEW.called_cents <> OLD.called_cents OR NEW.contributed_cents <> OLD.contributed_cents OR NEW.opening_capital_cents <> OLD.opening_capital_cents) THEN RAISE EXCEPTION 'Historical economics are fixed once decided'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER takeover_admission_guard BEFORE UPDATE OR DELETE ON public.investor_takeover_admissions FOR EACH ROW EXECUTE FUNCTION public.guard_takeover_admission();