ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_management';

ALTER TABLE public.client_pricing
  ADD COLUMN IF NOT EXISTS expires_on date,
  ADD COLUMN IF NOT EXISTS approval_reason text,
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'client_future';

CREATE TABLE public.fund_pricing_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  client_id uuid,
  status text NOT NULL CHECK (status IN ('approved','pricing_review','legacy_review')),
  pricing_version_id uuid,
  source text NOT NULL,
  baseline_total_cents bigint NOT NULL DEFAULT 0,
  final_total_cents bigint NOT NULL DEFAULT 0,
  approval_request_id uuid,
  approved_exception jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz
);
CREATE UNIQUE INDEX fund_pricing_snapshots_one_current ON public.fund_pricing_snapshots(offering_id) WHERE superseded_at IS NULL;

CREATE TABLE public.fund_pricing_snapshot_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.fund_pricing_snapshots(id),
  service_key text NOT NULL,
  label text NOT NULL,
  pricing_model text,
  pass_through boolean NOT NULL DEFAULT false,
  catalog_cents bigint,
  client_cents bigint,
  baseline_cents bigint NOT NULL DEFAULT 0,
  final_cents bigint NOT NULL DEFAULT 0,
  baseline_source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pricing_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid REFERENCES public.offerings(id),
  client_id uuid,
  snapshot_id uuid REFERENCES public.fund_pricing_snapshots(id),
  requested_by uuid NOT NULL,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decision_scope text CHECK (decision_scope IN ('fund_only','client_future')),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Reachable only through server functions (service role); no client policies.
GRANT ALL ON public.fund_pricing_snapshots, public.fund_pricing_snapshot_lines, public.pricing_approval_requests TO service_role;
ALTER TABLE public.fund_pricing_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_pricing_snapshot_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_approval_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.protect_fund_pricing_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Fund pricing snapshots are permanent'; END IF;
  IF NEW.offering_id <> OLD.offering_id OR NEW.final_total_cents <> OLD.final_total_cents
     OR NEW.baseline_total_cents <> OLD.baseline_total_cents OR NEW.created_at <> OLD.created_at
     OR NEW.source <> OLD.source THEN
    RAISE EXCEPTION 'Fund pricing snapshots cannot be rewritten';
  END IF;
  IF OLD.status = 'approved' AND NEW.status <> 'approved' THEN
    RAISE EXCEPTION 'An approved pricing snapshot cannot be reopened';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fund_pricing_snapshot_protect BEFORE UPDATE OR DELETE ON public.fund_pricing_snapshots
FOR EACH ROW EXECUTE FUNCTION public.protect_fund_pricing_snapshot();

CREATE OR REPLACE FUNCTION public.protect_fund_pricing_lines()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Fund pricing lines are permanent'; END $$;
CREATE TRIGGER fund_pricing_lines_protect BEFORE UPDATE OR DELETE ON public.fund_pricing_snapshot_lines
FOR EACH ROW EXECUTE FUNCTION public.protect_fund_pricing_lines();

CREATE OR REPLACE FUNCTION public.guard_pricing_approval()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Pricing approvals are permanent'; END IF;
  IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'This pricing request has already been decided'; END IF;
  IF NEW.decided_by IS NOT NULL AND NEW.decided_by = OLD.requested_by THEN
    RAISE EXCEPTION 'A pricing request cannot be approved by the person who requested it';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pricing_approval_guard BEFORE UPDATE OR DELETE ON public.pricing_approval_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_pricing_approval();