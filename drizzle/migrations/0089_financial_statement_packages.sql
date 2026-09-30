CREATE TABLE public.financial_statement_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  period_type text NOT NULL CHECK (period_type IN ('quarterly','annual')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  report_ids uuid[] NOT NULL DEFAULT '{}',
  figures jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','manager_review','approved','returned')),
  prepared_by uuid NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  returned_note text,
  manager_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);
GRANT ALL ON public.financial_statement_packages TO service_role;
ALTER TABLE public.financial_statement_packages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.financial_statement_package_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.financial_statement_packages(id),
  action text NOT NULL,
  actor_id uuid NOT NULL,
  actor_role text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.financial_statement_package_events TO service_role;
ALTER TABLE public.financial_statement_package_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.protect_statement_package()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Statement packages are never deleted'; END IF;
  IF OLD.status = 'approved' THEN
    IF NEW.manager_notified_at IS DISTINCT FROM OLD.manager_notified_at AND OLD.manager_notified_at IS NULL
       AND ROW(NEW.status, NEW.notes, NEW.figures, NEW.report_ids, NEW.approved_by) IS NOT DISTINCT FROM ROW(OLD.status, OLD.notes, OLD.figures, OLD.report_ids, OLD.approved_by) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'An approved statement package cannot be changed';
  END IF;
  IF NEW.status = 'manager_review' AND OLD.status = 'in_review' AND NEW.reviewed_by = OLD.prepared_by THEN
    RAISE EXCEPTION 'The reviewer must be different from the preparer';
  END IF;
  IF NEW.status = 'approved' AND (OLD.status <> 'manager_review' OR NEW.approved_by IS NULL
       OR NEW.approved_by = OLD.prepared_by OR NEW.approved_by = OLD.reviewed_by) THEN
    RAISE EXCEPTION 'Only a fund manager can approve a reviewed package, and not the preparer or reviewer';
  END IF;
  IF NEW.status = 'returned' AND coalesce(trim(NEW.returned_note),'') = '' THEN
    RAISE EXCEPTION 'Returning a package needs a note';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER protect_statement_package BEFORE UPDATE OR DELETE ON public.financial_statement_packages
FOR EACH ROW EXECUTE FUNCTION public.protect_statement_package();

CREATE OR REPLACE FUNCTION public.block_statement_package_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Statement package history is append-only'; END $$;
CREATE TRIGGER block_statement_package_event_mutation BEFORE UPDATE OR DELETE ON public.financial_statement_package_events
FOR EACH ROW EXECUTE FUNCTION public.block_statement_package_event_mutation();