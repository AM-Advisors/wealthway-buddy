-- A series fund ("X, a series of Y") takes its jurisdiction of formation from its master Y, recorded once.
CREATE OR REPLACE FUNCTION public.series_master_label(_name text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT nullif(btrim(substring(coalesce(_name, '') from '(?i)\ma series of\s+(.+)$')), '')
$$;

CREATE OR REPLACE FUNCTION public.series_master_key(_name text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT nullif(btrim(regexp_replace(
    regexp_replace(lower(coalesce(public.series_master_label(_name), '')), '[^a-z0-9]+', ' ', 'g'),
    '(\s+(l\s?l\s?c|inc|l\s?p|ltd))+\s*$', '', 'g')), '')
$$;

CREATE TABLE public.series_master_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_key text NOT NULL UNIQUE,
  name text NOT NULL,
  jurisdiction text,
  source text NOT NULL DEFAULT 'recorded' CHECK (source IN ('harmonious', 'recorded')),
  change_reason text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.series_master_entities TO service_role;
ALTER TABLE public.series_master_entities ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.series_master_entities IS 'Master LLC details shared by every series under it (jurisdiction of formation). Server-only.';

CREATE TABLE public.series_master_entity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id uuid NOT NULL REFERENCES public.series_master_entities(id),
  event text NOT NULL,
  from_jurisdiction text,
  to_jurisdiction text,
  actor_user_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.series_master_entity_events TO service_role;
ALTER TABLE public.series_master_entity_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_series_master_event_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Series master history is append-only';
END $$;
CREATE TRIGGER trg_series_master_events_append_only BEFORE UPDATE OR DELETE ON public.series_master_entity_events
  FOR EACH ROW EXECUTE FUNCTION public.block_series_master_event_mutation();

CREATE OR REPLACE FUNCTION public.log_series_master_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.series_master_entity_events(master_id, event, from_jurisdiction, to_jurisdiction, actor_user_id, reason)
    VALUES (NEW.id, 'recorded', NULL, NEW.jurisdiction, NEW.updated_by, NEW.change_reason);
  ELSIF NEW.jurisdiction IS DISTINCT FROM OLD.jurisdiction THEN
    INSERT INTO public.series_master_entity_events(master_id, event, from_jurisdiction, to_jurisdiction, actor_user_id, reason)
    VALUES (NEW.id, 'jurisdiction_changed', OLD.jurisdiction, NEW.jurisdiction, NEW.updated_by, NEW.change_reason);
    IF NEW.jurisdiction IS NOT NULL THEN
      UPDATE public.offerings o SET state_formed = NEW.jurisdiction
       WHERE public.series_master_key(coalesce(nullif(btrim(o.legal_entity_name), ''), o.name)) = NEW.name_key
         AND o.state_formed IS DISTINCT FROM NEW.jurisdiction;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_series_master_log AFTER INSERT OR UPDATE ON public.series_master_entities
  FOR EACH ROW EXECUTE FUNCTION public.log_series_master_change();

-- Every write to a series fund uses the master's recorded jurisdiction; the first one provided is recorded on the master.
CREATE OR REPLACE FUNCTION public.apply_series_master_jurisdiction() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _src text := coalesce(nullif(btrim(NEW.legal_entity_name), ''), NEW.name);
  _key text := public.series_master_key(_src);
  _m record;
BEGIN
  IF _key IS NULL THEN RETURN NEW; END IF;
  SELECT id, jurisdiction INTO _m FROM public.series_master_entities WHERE name_key = _key;
  IF FOUND AND _m.jurisdiction IS NOT NULL THEN
    NEW.state_formed := _m.jurisdiction;
  ELSIF nullif(btrim(coalesce(NEW.state_formed, '')), '') IS NOT NULL THEN
    INSERT INTO public.series_master_entities(name_key, name, jurisdiction, source, change_reason)
    VALUES (_key, public.series_master_label(_src), btrim(NEW.state_formed), 'recorded', 'First provided on ' || coalesce(NEW.name, 'a series fund'))
    ON CONFLICT (name_key) DO UPDATE SET jurisdiction = EXCLUDED.jurisdiction, change_reason = EXCLUDED.change_reason, updated_by = NULL, updated_at = now()
      WHERE public.series_master_entities.jurisdiction IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_offerings_series_master_jurisdiction BEFORE INSERT OR UPDATE OF state_formed, legal_entity_name, name ON public.offerings
  FOR EACH ROW EXECUTE FUNCTION public.apply_series_master_jurisdiction();

-- Backfill the new master table: Harmonious-managed masters, then masters whose existing series all agree.
INSERT INTO public.series_master_entities(name_key, name, jurisdiction, source, change_reason) VALUES
  (public.series_master_key('x, a series of HCAM TX'), 'HCAM TX', 'Texas', 'harmonious', 'Harmonious-managed master'),
  (public.series_master_key('x, a series of HCAM WY'), 'HCAM WY', 'Wyoming', 'harmonious', 'Harmonious-managed master'),
  (public.series_master_key('x, a series of AM SPV Fund Management LLC'), 'AM SPV Fund Management LLC', 'Delaware', 'harmonious', 'Harmonious-managed master')
ON CONFLICT (name_key) DO NOTHING;

INSERT INTO public.series_master_entities(name_key, name, jurisdiction, source, change_reason)
SELECT k, min(lbl), min(st), 'recorded', 'Recorded from existing series funds'
FROM (
  SELECT public.series_master_key(coalesce(nullif(btrim(legal_entity_name), ''), name)) AS k,
         public.series_master_label(coalesce(nullif(btrim(legal_entity_name), ''), name)) AS lbl,
         btrim(state_formed) AS st
  FROM public.offerings
  WHERE nullif(btrim(coalesce(state_formed, '')), '') IS NOT NULL
) x
WHERE k IS NOT NULL
GROUP BY k
HAVING count(DISTINCT lower(st)) = 1
ON CONFLICT (name_key) DO NOTHING;