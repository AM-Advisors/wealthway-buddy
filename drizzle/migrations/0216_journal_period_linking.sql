-- 1. Refuse overlapping periods within a book (existing unique only blocked identical ranges).
CREATE OR REPLACE FUNCTION public.guard_period_overlap() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF new.period_end < new.period_start THEN RAISE EXCEPTION 'Period end must be on or after its start.'; END IF;
  IF EXISTS (SELECT 1 FROM public.accounting_periods p WHERE p.book_id = new.book_id AND p.id <> new.id
             AND daterange(p.period_start, p.period_end, '[]') && daterange(new.period_start, new.period_end, '[]')) THEN
    RAISE EXCEPTION 'PERIOD OVERLAP: this book already has a period covering part of % – %.', new.period_start, new.period_end;
  END IF;
  IF tg_op = 'UPDATE' AND (new.period_start <> old.period_start OR new.period_end <> old.period_end OR new.book_id <> old.book_id) THEN
    RAISE EXCEPTION 'Period dates and book cannot be changed after creation.';
  END IF;
  RETURN new;
END $$;
DROP TRIGGER IF EXISTS accounting_periods_overlap_guard ON public.accounting_periods;
CREATE TRIGGER accounting_periods_overlap_guard BEFORE INSERT OR UPDATE ON public.accounting_periods FOR EACH ROW EXECUTE FUNCTION public.guard_period_overlap();

-- 2. Link batches + append-only events.
CREATE TABLE public.journal_period_link_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.ledger_books(id),
  period_id uuid NOT NULL REFERENCES public.accounting_periods(id),
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','approved','rejected','applied','superseded')),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  source text NOT NULL CHECK (length(btrim(source)) > 0),
  proposal jsonb NOT NULL,
  excluded jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposal_hash text NOT NULL,
  entry_count integer NOT NULL,
  prepared_by uuid NOT NULL, prepared_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid, reviewed_at timestamptz, review_note text,
  applied_by uuid, applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX journal_period_link_one_live ON public.journal_period_link_batches(period_id) WHERE status IN ('prepared','approved');
CREATE TABLE public.journal_period_link_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.journal_period_link_batches(id),
  entry_id uuid,
  event text NOT NULL,
  actor_user_id uuid NOT NULL,
  from_period_id uuid, to_period_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.journal_period_link_batches TO service_role;
GRANT ALL ON public.journal_period_link_events TO service_role;
ALTER TABLE public.journal_period_link_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_period_link_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_period_link_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Journal period-link history is append-only.'; END $$;
CREATE TRIGGER journal_period_link_events_append_only BEFORE UPDATE OR DELETE ON public.journal_period_link_events FOR EACH ROW EXECUTE FUNCTION public.block_period_link_event_mutation();

CREATE OR REPLACE FUNCTION public.guard_period_link_batch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF tg_op = 'DELETE' THEN RAISE EXCEPTION 'Link batches cannot be deleted.'; END IF;
  IF new.proposal IS DISTINCT FROM old.proposal OR new.proposal_hash <> old.proposal_hash OR new.period_id <> old.period_id
     OR new.book_id <> old.book_id OR new.prepared_by <> old.prepared_by OR new.entry_count <> old.entry_count THEN
    RAISE EXCEPTION 'A link proposal cannot be modified; prepare a new one.';
  END IF;
  IF old.status IN ('applied','rejected','superseded') THEN RAISE EXCEPTION 'This link batch is final.'; END IF;
  RETURN new;
END $$;
CREATE TRIGGER journal_period_link_batches_guard BEFORE UPDATE OR DELETE ON public.journal_period_link_batches FOR EACH ROW EXECUTE FUNCTION public.guard_period_link_batch();

-- 3. Posted journals: period reference may only be set (null -> period) by an approved batch apply.
CREATE OR REPLACE FUNCTION public.protect_posted_journal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare _batch text;
begin
  if tg_op = 'DELETE' then
    if old.status in ('posted', 'reversed') then
      raise exception 'A posted journal entry cannot be deleted. Post a reversing entry instead.';
    end if;
    return old;
  end if;
  if old.status = 'posted' and new.status not in ('posted', 'reversed') then
    raise exception 'A posted journal entry cannot return to an earlier state.';
  end if;
  if old.status = 'posted' then
    if new.book_id <> old.book_id or new.entry_date <> old.entry_date
       or new.source is distinct from old.source or new.posted_at is distinct from old.posted_at
       or new.posted_by is distinct from old.posted_by then
      raise exception 'Posted accounting entries are immutable.';
    end if;
  end if;
  if old.status in ('posted','reversed','voided') and new.period_id is distinct from old.period_id then
    _batch := current_setting('harmonious.period_link_batch', true);
    if old.period_id is not null or _batch is null or _batch = '' or old.status <> 'posted' then
      raise exception 'PERIOD LINK REFUSED: a posted journal''s period can only be assigned once, through an approved link batch.';
    end if;
    if not exists (select 1 from public.journal_period_link_batches b where b.id = _batch::uuid and b.status = 'approved'
                   and b.period_id = new.period_id and b.proposal @> jsonb_build_array(jsonb_build_object('entry_id', new.id::text))) then
      raise exception 'PERIOD LINK REFUSED: journal % is not in the approved batch for that period.', new.id;
    end if;
  end if;
  return new;
end;
$function$;

-- 4. Proposal builder (read-only evaluation; stores an immutable proposal when _persist).
CREATE OR REPLACE FUNCTION public.evaluate_journal_period_links(_period uuid)
RETURNS TABLE(entry_id uuid, entry_no bigint, entry_date date, posted_at timestamptz, status text, current_period uuid,
              source text, source_table text, source_id uuid, debit_cents bigint, credit_cents bigint,
              prepared_by uuid, reviewed_by uuid, approved_by uuid, posted_by uuid, eligible boolean, reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH p AS (SELECT * FROM accounting_periods WHERE id = _period)
  SELECT j.id, j.entry_no, j.entry_date, j.posted_at, j.status::text, j.period_id, j.source::text, j.source_table, j.source_id,
         COALESCE(l.dr,0)::bigint, COALESCE(l.cr,0)::bigint, j.prepared_by, j.reviewed_by, j.approved_by, j.posted_by,
         (j.status = 'posted' AND j.period_id IS NULL AND j.entry_date BETWEEN p.period_start AND p.period_end AND p.status = 'open' AND COALESCE(l.dr,0) = COALESCE(l.cr,0)),
         CASE WHEN p.status <> 'open' THEN 'Period is not open'
              WHEN j.status <> 'posted' THEN 'Journal is ' || j.status || ', not posted'
              WHEN j.entry_date NOT BETWEEN p.period_start AND p.period_end THEN 'Journal date ' || j.entry_date || ' is outside the period'
              WHEN j.period_id IS NOT NULL AND j.period_id <> p.id THEN 'Already linked to another period'
              WHEN j.period_id = p.id THEN 'Already linked to this period'
              WHEN COALESCE(l.dr,0) <> COALESCE(l.cr,0) THEN 'Debits and credits differ'
              ELSE 'Eligible' END
  FROM p JOIN journal_entries j ON j.book_id = p.book_id
  LEFT JOIN LATERAL (SELECT sum(debit_cents) dr, sum(credit_cents) cr FROM journal_lines WHERE journal_lines.entry_id = j.id) l ON true
  ORDER BY j.entry_date, j.entry_no
$$;

CREATE OR REPLACE FUNCTION public.prepare_journal_period_link_batch(_period uuid, _actor uuid, _reason text, _source text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _p accounting_periods; _prop jsonb; _exc jsonb; _hash text; _n int; _id uuid;
BEGIN
  SELECT * INTO _p FROM accounting_periods WHERE id = _period;
  IF NOT FOUND THEN RAISE EXCEPTION 'Period not found.'; END IF;
  IF _p.status <> 'open' THEN RAISE EXCEPTION 'PERIOD LINK REFUSED: the period is %, not open.', _p.status; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('entry_id', entry_id::text, 'entry_no', entry_no, 'entry_date', entry_date, 'debit_cents', debit_cents, 'credit_cents', credit_cents) ORDER BY entry_date, entry_no) FILTER (WHERE eligible), '[]'),
         COALESCE(jsonb_agg(jsonb_build_object('entry_id', entry_id::text, 'entry_no', entry_no, 'entry_date', entry_date, 'status', status, 'reason', reason)) FILTER (WHERE NOT eligible), '[]'),
         count(*) FILTER (WHERE eligible),
         md5(COALESCE(string_agg(entry_id::text||'|'||entry_date||'|'||debit_cents||'|'||credit_cents, ',' ORDER BY entry_id) FILTER (WHERE eligible), '') || '@' || _period::text)
    INTO _prop, _exc, _n, _hash FROM evaluate_journal_period_links(_period);
  IF _n = 0 THEN RAISE EXCEPTION 'No eligible journals for this period.'; END IF;
  INSERT INTO journal_period_link_batches(book_id, period_id, reason, source, proposal, excluded, proposal_hash, entry_count, prepared_by)
  VALUES (_p.book_id, _period, _reason, _source, _prop, _exc, _hash, _n, _actor) RETURNING id INTO _id;
  INSERT INTO journal_period_link_events(batch_id, event, actor_user_id, to_period_id, detail) VALUES (_id, 'prepared', _actor, _period, jsonb_build_object('entries', _n, 'hash', _hash));
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.review_journal_period_link_batch(_batch uuid, _actor uuid, _decision text, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _b journal_period_link_batches;
BEGIN
  SELECT * INTO _b FROM journal_period_link_batches WHERE id = _batch FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found.'; END IF;
  IF _b.status <> 'prepared' THEN RAISE EXCEPTION 'Only a prepared batch can be reviewed.'; END IF;
  IF _actor = _b.prepared_by THEN RAISE EXCEPTION 'SEGREGATION: the preparer cannot review their own link batch.'; END IF;
  IF _decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Decision must be approved or rejected.'; END IF;
  IF COALESCE(btrim(_note),'') = '' THEN RAISE EXCEPTION 'A review note is required.'; END IF;
  UPDATE journal_period_link_batches SET status = _decision, reviewed_by = _actor, reviewed_at = now(), review_note = _note WHERE id = _batch;
  INSERT INTO journal_period_link_events(batch_id, event, actor_user_id, to_period_id, detail) VALUES (_batch, _decision, _actor, _b.period_id, jsonb_build_object('note', _note));
END $$;

CREATE OR REPLACE FUNCTION public.apply_journal_period_link_batch(_batch uuid, _actor uuid, _expected_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _b journal_period_link_batches; _p accounting_periods; _hash text; _n int; _item jsonb; _e journal_entries; _dr bigint; _cr bigint;
BEGIN
  SELECT * INTO _b FROM journal_period_link_batches WHERE id = _batch FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found.'; END IF;
  IF _b.status = 'applied' THEN RETURN jsonb_build_object('applied', 0, 'idempotent', true, 'batch', _batch); END IF;
  IF _b.status <> 'approved' THEN RAISE EXCEPTION 'PERIOD LINK REFUSED: batch is %, not approved.', _b.status; END IF;
  IF _actor IN (_b.prepared_by, _b.reviewed_by) THEN RAISE EXCEPTION 'SEGREGATION: the preparer or reviewer cannot apply this batch.'; END IF;
  IF _expected_hash IS DISTINCT FROM _b.proposal_hash THEN RAISE EXCEPTION 'PERIOD LINK REFUSED: the proposal hash does not match the approved proposal.'; END IF;
  SELECT * INTO _p FROM accounting_periods WHERE id = _b.period_id FOR UPDATE;
  IF _p.status <> 'open' THEN RAISE EXCEPTION 'PERIOD LINK REFUSED: the period is %, not open.', _p.status; END IF;
  SELECT md5(COALESCE(string_agg((x->>'entry_id')||'|'||(x->>'entry_date')||'|'||(x->>'debit_cents')||'|'||(x->>'credit_cents'), ',' ORDER BY x->>'entry_id'), '') || '@' || _b.period_id::text)
    INTO _hash FROM jsonb_array_elements(_b.proposal) x;
  IF _hash <> _b.proposal_hash THEN RAISE EXCEPTION 'PERIOD LINK REFUSED: the stored proposal was altered.'; END IF;
  PERFORM set_config('harmonious.period_link_batch', _batch::text, true);
  _n := 0;
  FOR _item IN SELECT * FROM jsonb_array_elements(_b.proposal) LOOP
    SELECT * INTO _e FROM journal_entries WHERE id = (_item->>'entry_id')::uuid FOR UPDATE;
    SELECT COALESCE(sum(debit_cents),0), COALESCE(sum(credit_cents),0) INTO _dr, _cr FROM journal_lines WHERE entry_id = _e.id;
    IF _e.id IS NULL OR _e.book_id <> _b.book_id OR _e.status <> 'posted' OR _e.period_id IS NOT NULL
       OR _e.entry_date::text <> _item->>'entry_date' OR _e.entry_date NOT BETWEEN _p.period_start AND _p.period_end
       OR _dr::text <> _item->>'debit_cents' OR _cr::text <> _item->>'credit_cents' THEN
      RAISE EXCEPTION 'PERIOD LINK REFUSED: journal % no longer matches the approved proposal; nothing was applied.', _item->>'entry_id';
    END IF;
    UPDATE journal_entries SET period_id = _b.period_id WHERE id = _e.id;
    INSERT INTO journal_period_link_events(batch_id, entry_id, event, actor_user_id, from_period_id, to_period_id, detail)
    VALUES (_batch, _e.id, 'linked', _actor, NULL, _b.period_id, jsonb_build_object('entry_date', _e.entry_date, 'debit_cents', _dr, 'credit_cents', _cr));
    _n := _n + 1;
  END LOOP;
  UPDATE journal_period_link_batches SET status = 'applied', applied_by = _actor, applied_at = now() WHERE id = _batch;
  INSERT INTO journal_period_link_events(batch_id, event, actor_user_id, to_period_id, detail) VALUES (_batch, 'applied', _actor, _b.period_id, jsonb_build_object('entries', _n));
  PERFORM set_config('harmonious.period_link_batch', '', true);
  RETURN jsonb_build_object('applied', _n, 'idempotent', false, 'batch', _batch);
END $$;

REVOKE ALL ON FUNCTION public.evaluate_journal_period_links(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_journal_period_link_batch(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_journal_period_link_batch(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_journal_period_link_batch(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_journal_period_links(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_journal_period_link_batch(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_journal_period_link_batch(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_journal_period_link_batch(uuid, uuid, text) TO service_role;