CREATE TABLE public.fund_setup_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  step text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('to_manager','to_harmonious')),
  sent_by uuid NOT NULL,
  sent_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'utc')::date),
  channel text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_id, step, direction, sent_on)
);
GRANT ALL ON public.fund_setup_reminders TO service_role;
ALTER TABLE public.fund_setup_reminders ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.fund_setup_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  field text NOT NULL,
  value text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('drive','default')),
  source_file_id text,
  source_file_name text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fund_setup_proposal_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL UNIQUE REFERENCES public.fund_setup_proposals(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('accepted','skipped')),
  decided_by uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_setup_proposals, public.fund_setup_proposal_decisions TO service_role;
ALTER TABLE public.fund_setup_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_setup_proposal_decisions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_fund_setup_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Fund setup history is append-only'; END $$;
CREATE TRIGGER fund_setup_reminders_append_only BEFORE UPDATE OR DELETE ON public.fund_setup_reminders FOR EACH ROW EXECUTE FUNCTION public.block_fund_setup_history_mutation();
CREATE TRIGGER fund_setup_proposals_append_only BEFORE UPDATE OR DELETE ON public.fund_setup_proposals FOR EACH ROW EXECUTE FUNCTION public.block_fund_setup_history_mutation();
CREATE TRIGGER fund_setup_proposal_decisions_append_only BEFORE UPDATE OR DELETE ON public.fund_setup_proposal_decisions FOR EACH ROW EXECUTE FUNCTION public.block_fund_setup_history_mutation();