CREATE TABLE public.fund_migration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('wix','drive','client')),
  source_ref text,
  fund_name text NOT NULL,
  client_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  requested_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  offering_id uuid,
  import_summary jsonb
);
CREATE UNIQUE INDEX fund_migration_requests_open_source ON public.fund_migration_requests (source, source_ref) WHERE source_ref IS NOT NULL AND status <> 'declined';
GRANT SELECT ON public.fund_migration_requests TO authenticated;
GRANT ALL ON public.fund_migration_requests TO service_role;
ALTER TABLE public.fund_migration_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Requesters see their own migration requests" ON public.fund_migration_requests FOR SELECT TO authenticated USING (requested_by = auth.uid());

CREATE OR REPLACE FUNCTION public.fund_migration_requests_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'A decided migration request cannot be changed.'; END IF;
  IF NEW.status <> 'pending' THEN
    IF NEW.decided_by IS NULL THEN RAISE EXCEPTION 'A decision needs a reviewer.'; END IF;
    IF NEW.decided_by = OLD.requested_by AND NOT (public.has_role(NEW.decided_by, 'super_admin') AND length(trim(coalesce(NEW.decision_note,''))) > 0) THEN
      RAISE EXCEPTION 'A different staff member must decide this migration request.';
    END IF;
  END IF;
  IF NEW.requested_by <> OLD.requested_by OR NEW.source <> OLD.source OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Request origin cannot be changed.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fund_migration_requests_guard BEFORE UPDATE ON public.fund_migration_requests FOR EACH ROW EXECUTE FUNCTION public.fund_migration_requests_guard();