CREATE TABLE public.fund_intake_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_intake_runs TO service_role;
ALTER TABLE public.fund_intake_runs ENABLE ROW LEVEL SECURITY;
CREATE INDEX fund_intake_runs_offering ON public.fund_intake_runs(offering_id, created_at DESC);

CREATE TABLE public.fund_intake_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.fund_intake_runs(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('drive','box')),
  source_file_id text NOT NULL,
  name text NOT NULL,
  folder_path text,
  mime_type text,
  size_bytes bigint,
  sort text NOT NULL DEFAULT 'fund' CHECK (sort IN ('fund','investor','skip')),
  status text NOT NULL DEFAULT 'listed' CHECK (status IN ('listed','reading','read','failed','skipped')),
  error text,
  fund_reading jsonb,
  investor_reading jsonb,
  applied jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, provider, source_file_id)
);
GRANT ALL ON public.fund_intake_files TO service_role;
ALTER TABLE public.fund_intake_files ENABLE ROW LEVEL SECURITY;
CREATE INDEX fund_intake_files_run ON public.fund_intake_files(run_id, status);

CREATE TABLE public.fund_intake_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.fund_intake_runs(id) ON DELETE CASCADE,
  file_id uuid,
  subject text NOT NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.fund_intake_decisions TO service_role;
ALTER TABLE public.fund_intake_decisions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_fund_intake_decision_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Fund intake decisions are append-only';
END $$;
CREATE TRIGGER fund_intake_decisions_append_only BEFORE UPDATE OR DELETE ON public.fund_intake_decisions
FOR EACH ROW EXECUTE FUNCTION public.block_fund_intake_decision_mutation();