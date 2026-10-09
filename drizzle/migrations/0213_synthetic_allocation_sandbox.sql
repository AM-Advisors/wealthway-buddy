CREATE TABLE public.synthetic_allocation_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  version integer NOT NULL,
  rules jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected','superseded')),
  classification text NOT NULL DEFAULT 'DEMO / SYNTHETIC — QA ALLOCATION POLICY — NOT CONTRACTUAL TERMS',
  rationale text NOT NULL,
  prepared_by uuid NOT NULL, prepared_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid, approved_at timestamptz, decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_id, version)
);
CREATE TABLE public.synthetic_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  position_id uuid NOT NULL,
  investor_name text NOT NULL, class_label text NOT NULL,
  commitment_cents bigint NOT NULL, opening_capital_cents bigint NOT NULL,
  admission_status text NOT NULL DEFAULT 'source_only_not_formally_admitted' CHECK (admission_status = 'source_only_not_formally_admitted'),
  source_ref text NOT NULL, flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved_for_synthetic_use','rejected')),
  prepared_by uuid NOT NULL, prepared_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid, reviewed_at timestamptz, decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_id, position_id)
);
CREATE TABLE public.synthetic_allocation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  policy_id uuid NOT NULL REFERENCES public.synthetic_allocation_policies(id),
  nav_version_id uuid NOT NULL REFERENCES public.nav_versions(id),
  period_start date NOT NULL, period_end date NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'preview' CHECK (status IN ('preview','reviewed','rejected')),
  classification text NOT NULL DEFAULT 'DEMO / SYNTHETIC — UNAUDITED — NOT A CAPITAL ACCOUNT — NOT FOR INVESTOR DISTRIBUTION',
  totals jsonb NOT NULL, residuals jsonb NOT NULL, lineage jsonb NOT NULL DEFAULT '{}'::jsonb,
  difference_cents bigint NOT NULL,
  prepared_by uuid NOT NULL, prepared_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid, reviewed_at timestamptz, review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_id, period_end, version)
);
CREATE TABLE public.synthetic_allocation_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.synthetic_allocation_runs(id),
  offering_id uuid NOT NULL,
  position_id uuid NOT NULL,
  investor_name text NOT NULL, class_label text NOT NULL,
  detail jsonb NOT NULL,
  ending_capital_cents bigint NOT NULL,
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, position_id)
);

GRANT ALL ON public.synthetic_allocation_policies, public.synthetic_participants, public.synthetic_allocation_runs, public.synthetic_allocation_lines TO service_role;
ALTER TABLE public.synthetic_allocation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synthetic_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synthetic_allocation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synthetic_allocation_lines ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.assert_demo_offering(_offering uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce((SELECT c.is_test_demo FROM public.offerings o LEFT JOIN public.clients c ON c.id = o.client_id WHERE o.id = _offering), false) THEN
    RAISE EXCEPTION 'Synthetic allocation records are allowed only on isolated TEST/DEMO funds.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_synthetic_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Synthetic allocation policies are never deleted.'; END IF;
  PERFORM public.assert_demo_offering(NEW.offering_id);
  IF coalesce(NEW.rules->>'carry','none') <> 'none' THEN RAISE EXCEPTION 'Carried interest is not permitted without approved, sourced waterfall terms.'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('approved','rejected','superseded') AND (NEW.rules <> OLD.rules OR NEW.version <> OLD.version OR NEW.offering_id <> OLD.offering_id OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR (NEW.status <> OLD.status AND NOT (OLD.status='approved' AND NEW.status='superseded'))) THEN
      RAISE EXCEPTION 'An approved synthetic policy version is immutable; create a new version.';
    END IF;
    IF NEW.classification <> OLD.classification THEN RAISE EXCEPTION 'Synthetic classification cannot be removed or changed.'; END IF;
  END IF;
  IF NEW.status = 'approved' AND (NEW.approved_by IS NULL OR NEW.approved_by = NEW.prepared_by) THEN
    RAISE EXCEPTION 'A synthetic policy must be approved by someone other than its preparer.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_synthetic_policy BEFORE INSERT OR UPDATE OR DELETE ON public.synthetic_allocation_policies FOR EACH ROW EXECUTE FUNCTION public.guard_synthetic_policy();

CREATE OR REPLACE FUNCTION public.guard_synthetic_participant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Synthetic participant records are never deleted.'; END IF;
  PERFORM public.assert_demo_offering(NEW.offering_id);
  IF TG_OP = 'UPDATE' AND OLD.status <> 'proposed' THEN RAISE EXCEPTION 'A decided synthetic participant record is immutable.'; END IF;
  IF NEW.status <> 'proposed' AND (NEW.reviewed_by IS NULL OR NEW.reviewed_by = NEW.prepared_by) THEN
    RAISE EXCEPTION 'A synthetic participant must be reviewed by someone other than its preparer.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_synthetic_participant BEFORE INSERT OR UPDATE OR DELETE ON public.synthetic_participants FOR EACH ROW EXECUTE FUNCTION public.guard_synthetic_participant();

CREATE OR REPLACE FUNCTION public.guard_synthetic_run()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n record; p record;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Synthetic allocation runs are never deleted.'; END IF;
  PERFORM public.assert_demo_offering(NEW.offering_id);
  SELECT offering_id, synthetic_classification, approval_scope, status INTO n FROM public.nav_versions WHERE id = NEW.nav_version_id;
  IF n.offering_id <> NEW.offering_id THEN RAISE EXCEPTION 'Cross-fund NAV reference refused.'; END IF;
  IF n.synthetic_classification IS NULL OR n.approval_scope IS DISTINCT FROM 'internal_synthetic_only' OR n.status::text <> 'approved' THEN
    RAISE EXCEPTION 'Synthetic allocations must reference an approved internal_synthetic_only NAV.';
  END IF;
  SELECT offering_id, status INTO p FROM public.synthetic_allocation_policies WHERE id = NEW.policy_id;
  IF p.offering_id <> NEW.offering_id OR p.status <> 'approved' THEN RAISE EXCEPTION 'An approved synthetic policy for this fund is required.'; END IF;
  IF NEW.difference_cents <> 0 THEN RAISE EXCEPTION 'Investor totals must equal the synthetic NAV exactly; no balancing adjustment is allowed.'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.classification <> OLD.classification THEN RAISE EXCEPTION 'Synthetic classification cannot be removed or changed.'; END IF;
    IF OLD.status <> 'preview' THEN RAISE EXCEPTION 'A reviewed synthetic allocation is immutable; create a new version.'; END IF;
    IF NEW.totals <> OLD.totals OR NEW.residuals <> OLD.residuals OR NEW.nav_version_id <> OLD.nav_version_id OR NEW.policy_id <> OLD.policy_id THEN
      RAISE EXCEPTION 'Synthetic allocation results cannot be edited; create a new version.';
    END IF;
  END IF;
  IF NEW.status <> 'preview' AND (NEW.reviewed_by IS NULL OR NEW.reviewed_by = NEW.prepared_by) THEN
    RAISE EXCEPTION 'A synthetic allocation must be reviewed by someone other than its preparer.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_synthetic_run BEFORE INSERT OR UPDATE OR DELETE ON public.synthetic_allocation_runs FOR EACH ROW EXECUTE FUNCTION public.guard_synthetic_run();

CREATE OR REPLACE FUNCTION public.guard_synthetic_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Synthetic allocation lines are immutable.'; END IF;
  SELECT offering_id, status INTO r FROM public.synthetic_allocation_runs WHERE id = NEW.run_id;
  IF r.offering_id <> NEW.offering_id THEN RAISE EXCEPTION 'Cross-fund allocation line refused.'; END IF;
  IF r.status <> 'preview' THEN RAISE EXCEPTION 'Lines cannot be added to a reviewed synthetic allocation.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_synthetic_line BEFORE INSERT OR UPDATE OR DELETE ON public.synthetic_allocation_lines FOR EACH ROW EXECUTE FUNCTION public.guard_synthetic_line();

CREATE OR REPLACE FUNCTION public.guard_production_allocation_nav()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.nav_version_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.nav_versions n WHERE n.id = NEW.nav_version_id AND n.synthetic_classification IS NOT NULL) THEN
    RAISE EXCEPTION 'A synthetic NAV cannot feed production allocations or investor capital accounts.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_production_allocation_nav BEFORE INSERT OR UPDATE ON public.allocation_runs FOR EACH ROW EXECUTE FUNCTION public.guard_production_allocation_nav();