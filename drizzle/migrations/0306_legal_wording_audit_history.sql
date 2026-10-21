CREATE TABLE public.legal_wording_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wording_version_id uuid NOT NULL REFERENCES public.legal_wording_versions(id),
  requirement_key text NOT NULL,
  version integer NOT NULL,
  event text NOT NULL CHECK (event IN ('drafted','approved','retired')),
  actor_user_id uuid,
  wording_snapshot text NOT NULL,
  title_snapshot text NOT NULL,
  effective_date date NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.legal_wording_events TO authenticated;
GRANT ALL ON public.legal_wording_events TO service_role;
ALTER TABLE public.legal_wording_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX legal_wording_events_version_idx ON public.legal_wording_events (wording_version_id, occurred_at);

CREATE OR REPLACE FUNCTION public.block_legal_wording_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Legal wording history is permanent and cannot be changed or deleted.'; END $$;
CREATE TRIGGER legal_wording_events_immutable BEFORE UPDATE OR DELETE ON public.legal_wording_events
  FOR EACH ROW EXECUTE FUNCTION public.block_legal_wording_event_mutation();

CREATE OR REPLACE FUNCTION public.guard_legal_wording_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Legal wording versions are preserved and cannot be deleted; retire them instead.';
  END IF;
  IF NEW.wording IS DISTINCT FROM OLD.wording OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.requirement_key IS DISTINCT FROM OLD.requirement_key OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.effective_date IS DISTINCT FROM OLD.effective_date THEN
    RAISE EXCEPTION 'Legal wording text is fixed once saved; create a new version instead.';
  END IF;
  IF OLD.status = 'retired' AND NEW.status <> 'retired' THEN
    RAISE EXCEPTION 'A retired wording version cannot be reactivated; create a new version.';
  END IF;
  IF OLD.approved_by IS NOT NULL AND (NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at) THEN
    RAISE EXCEPTION 'Approval records cannot be rewritten.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER legal_wording_versions_guard BEFORE UPDATE OR DELETE ON public.legal_wording_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_legal_wording_version();

CREATE OR REPLACE FUNCTION public.log_legal_wording_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ev text; who uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN ev := 'drafted'; who := NEW.created_by;
    IF NEW.status = 'approved' THEN
      INSERT INTO legal_wording_events (wording_version_id, requirement_key, version, event, actor_user_id, wording_snapshot, title_snapshot, effective_date)
      VALUES (NEW.id, NEW.requirement_key, NEW.version, 'drafted', NEW.created_by, NEW.wording, NEW.title, NEW.effective_date);
      ev := 'approved'; who := NEW.approved_by;
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    ev := NEW.status; who := CASE WHEN NEW.status = 'approved' THEN NEW.approved_by ELSE NULLIF(current_setting('app.actor_user_id', true), '')::uuid END;
  ELSE RETURN NEW; END IF;
  INSERT INTO legal_wording_events (wording_version_id, requirement_key, version, event, actor_user_id, wording_snapshot, title_snapshot, effective_date)
  VALUES (NEW.id, NEW.requirement_key, NEW.version, ev, who, NEW.wording, NEW.title, NEW.effective_date);
  RETURN NEW;
END $$;
CREATE TRIGGER legal_wording_versions_log AFTER INSERT OR UPDATE ON public.legal_wording_versions
  FOR EACH ROW EXECUTE FUNCTION public.log_legal_wording_event();

ALTER TABLE public.legal_wording_versions ADD COLUMN IF NOT EXISTS retired_by uuid;

INSERT INTO public.legal_wording_events (wording_version_id, requirement_key, version, event, actor_user_id, wording_snapshot, title_snapshot, effective_date, occurred_at)
SELECT id, requirement_key, version, 'drafted', created_by, wording, title, effective_date, created_at FROM public.legal_wording_versions;