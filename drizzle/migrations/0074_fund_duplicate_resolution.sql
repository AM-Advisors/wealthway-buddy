ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS consolidated_into uuid REFERENCES public.offerings(id),
  ADD COLUMN IF NOT EXISTS consolidated_at timestamptz,
  ADD COLUMN IF NOT EXISTS consolidated_by uuid,
  ADD COLUMN IF NOT EXISTS consolidation_reason text;

CREATE TABLE public.fund_duplicate_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_key text NOT NULL UNIQUE,
  fund_ids uuid[] NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','needs_review','keep_separate_pending_rename','resolved_separate','consolidation_pending','consolidated','failed')),
  decision text CHECK (decision IN ('same_fund','different_funds','needs_review')),
  canonical_id uuid REFERENCES public.offerings(id),
  duplicate_id uuid REFERENCES public.offerings(id),
  acknowledged_conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text,
  failure_message text,
  decided_by uuid,
  decided_at timestamptz,
  consolidated_by uuid,
  consolidated_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_duplicate_reviews TO service_role;
ALTER TABLE public.fund_duplicate_reviews ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.fund_duplicate_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.fund_duplicate_reviews(id),
  event text NOT NULL,
  actor_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_duplicate_review_events TO service_role;
ALTER TABLE public.fund_duplicate_review_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.fund_aliases (
  old_offering_id uuid PRIMARY KEY REFERENCES public.offerings(id),
  canonical_offering_id uuid NOT NULL REFERENCES public.offerings(id),
  review_id uuid REFERENCES public.fund_duplicate_reviews(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (old_offering_id <> canonical_offering_id)
);
GRANT ALL ON public.fund_aliases TO service_role;
ALTER TABLE public.fund_aliases ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.fund_consolidation_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.fund_duplicate_reviews(id),
  from_offering_id uuid NOT NULL,
  to_offering_id uuid NOT NULL,
  table_name text NOT NULL,
  column_name text NOT NULL,
  row_ids text[] NOT NULL DEFAULT '{}',
  moved_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_consolidation_moves TO service_role;
ALTER TABLE public.fund_consolidation_moves ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_fund_dedupe_history_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'P0001';
END $$;
CREATE TRIGGER fund_aliases_immutable BEFORE UPDATE OR DELETE ON public.fund_aliases FOR EACH ROW EXECUTE FUNCTION public.block_fund_dedupe_history_mutation();
CREATE TRIGGER fund_consolidation_moves_immutable BEFORE UPDATE OR DELETE ON public.fund_consolidation_moves FOR EACH ROW EXECUTE FUNCTION public.block_fund_dedupe_history_mutation();
CREATE TRIGGER fund_duplicate_review_events_immutable BEFORE UPDATE OR DELETE ON public.fund_duplicate_review_events FOR EACH ROW EXECUTE FUNCTION public.block_fund_dedupe_history_mutation();

-- Tables whose rows keep the original Fund ID for provenance (never moved).
CREATE OR REPLACE FUNCTION public.fund_dependency_preserved(_tbl text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT _tbl LIKE '%\_history' OR _tbl LIKE '%\_events' OR _tbl LIKE 'fund\_record\_sync\_%'
      OR _tbl IN ('fund_duplicate_reviews','fund_duplicate_review_events','fund_aliases','fund_consolidation_moves','offerings')
$$;

CREATE OR REPLACE FUNCTION public.fund_dependency_counts(_offering uuid)
RETURNS TABLE(table_name text, column_name text, row_count bigint, preserved boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n bigint;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname::text AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND c.confrelid = 'public.offerings'::regclass AND array_length(c.conkey,1) = 1
     ORDER BY 1, 2
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', r.tbl, r.col) INTO n USING _offering;
    IF n > 0 THEN
      table_name := replace(r.tbl, 'public.', ''); column_name := r.col; row_count := n;
      preserved := public.fund_dependency_preserved(replace(r.tbl, 'public.', ''));
      RETURN NEXT;
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.fund_dependency_counts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fund_dependency_counts(uuid) TO service_role;

-- Atomic consolidation: every move succeeds or the whole call rolls back.
CREATE OR REPLACE FUNCTION public.consolidate_duplicate_fund(_review uuid, _canonical uuid, _duplicate uuid, _actor uuid, _reason text, _expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rv public.fund_duplicate_reviews%ROWTYPE; r record; ids text[]; n integer; total integer := 0; has_id boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fund-consolidate:' || _review::text));
  SELECT * INTO rv FROM public.fund_duplicate_reviews WHERE id = _review FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review_not_found'; END IF;
  IF rv.status = 'consolidated' THEN RAISE EXCEPTION 'already_consolidated'; END IF;
  IF rv.version <> _expected_version THEN RAISE EXCEPTION 'stale_review'; END IF;
  IF rv.decision IS DISTINCT FROM 'same_fund' OR rv.canonical_id IS DISTINCT FROM _canonical OR rv.duplicate_id IS DISTINCT FROM _duplicate THEN
    RAISE EXCEPTION 'decision_mismatch';
  END IF;
  IF NOT (_canonical = ANY(rv.fund_ids) AND _duplicate = ANY(rv.fund_ids)) OR _canonical = _duplicate THEN
    RAISE EXCEPTION 'fund_not_in_pair';
  END IF;
  IF EXISTS (SELECT 1 FROM public.offerings WHERE id IN (_canonical,_duplicate) AND consolidated_into IS NOT NULL) THEN
    RAISE EXCEPTION 'fund_already_retired';
  END IF;

  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl, replace(c.conrelid::regclass::text,'public.','') AS short, a.attname::text AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND c.confrelid = 'public.offerings'::regclass AND array_length(c.conkey,1) = 1
     ORDER BY 1, 2
  LOOP
    CONTINUE WHEN public.fund_dependency_preserved(r.short);
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=r.short AND column_name='id') INTO has_id;
    IF has_id THEN
      EXECUTE format('SELECT coalesce(array_agg(id::text), ''{}'') FROM %s WHERE %I = $1', r.tbl, r.col) INTO ids USING _duplicate;
    ELSE ids := '{}'; END IF;
    EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', r.tbl, r.col, r.col) USING _canonical, _duplicate;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      INSERT INTO public.fund_consolidation_moves(review_id, from_offering_id, to_offering_id, table_name, column_name, row_ids, moved_count)
      VALUES (_review, _duplicate, _canonical, r.short, r.col, ids, n);
      total := total + n;
    END IF;
  END LOOP;

  INSERT INTO public.fund_aliases(old_offering_id, canonical_offering_id, review_id, created_by) VALUES (_duplicate, _canonical, _review, _actor);
  UPDATE public.offerings SET consolidated_into = _canonical, consolidated_at = now(), consolidated_by = _actor,
         consolidation_reason = _reason, is_open = false, public_page_enabled = false WHERE id = _duplicate;
  UPDATE public.fund_duplicate_reviews SET status = 'consolidated', consolidated_by = _actor, consolidated_at = now(),
         failure_message = NULL, version = version + 1, updated_at = now() WHERE id = _review;
  INSERT INTO public.fund_duplicate_review_events(review_id, event, actor_id, detail)
  VALUES (_review, 'consolidated', _actor, jsonb_build_object('canonical', _canonical, 'duplicate', _duplicate, 'moved', total));
  RETURN jsonb_build_object('moved', total);
END $$;
REVOKE ALL ON FUNCTION public.consolidate_duplicate_fund(uuid,uuid,uuid,uuid,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consolidate_duplicate_fund(uuid,uuid,uuid,uuid,text,integer) TO service_role;

-- A consolidated Fund can never receive a new Investment.
CREATE OR REPLACE FUNCTION public.block_investment_on_consolidated_fund()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.offering_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.offerings WHERE id = NEW.offering_id AND consolidated_into IS NOT NULL) THEN
    RAISE EXCEPTION 'fund_consolidated: this Fund was consolidated and cannot receive new Investments' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER investor_onboardings_no_consolidated_fund BEFORE INSERT ON public.investor_onboardings FOR EACH ROW EXECUTE FUNCTION public.block_investment_on_consolidated_fund();

-- Retired Funds keep their name; they are excluded from the live uniqueness guard.
CREATE OR REPLACE FUNCTION public.guard_unique_fund_name()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  n text := public.normalize_fund_name(NEW.name);
  hit uuid;
BEGIN
  IF n IS NULL THEN
    RAISE EXCEPTION 'A Fund name is required.' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' AND n IS NOT DISTINCT FROM public.normalize_fund_name(OLD.name) THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('fund-name:' || n));
  SELECT id INTO hit FROM public.offerings
   WHERE public.normalize_fund_name(name) = n AND id <> NEW.id AND consolidated_into IS NULL LIMIT 1;
  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate_fund_name:%', hit USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;