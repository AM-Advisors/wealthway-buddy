CREATE TABLE public.journal_period_link_policy_versions (
  version integer PRIMARY KEY,
  required_people integer NOT NULL CHECK (required_people IN (2,3)),
  reviewer_may_apply boolean NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  authorized_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((required_people = 2) = reviewer_may_apply)
);
GRANT ALL ON public.journal_period_link_policy_versions TO service_role;
ALTER TABLE public.journal_period_link_policy_versions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER journal_period_link_policy_append_only BEFORE UPDATE OR DELETE ON public.journal_period_link_policy_versions FOR EACH ROW EXECUTE FUNCTION public.block_period_link_event_mutation();
INSERT INTO public.journal_period_link_policy_versions(version, required_people, reviewer_may_apply, effective_at, reason, authorized_by) VALUES
 (1, 3, false, '2026-10-09 17:40:00+00', 'Initial: preparer, reviewer and applier must differ.', 'Initial implementation'),
 (2, 2, true, now(), 'Maker-checker: independent reviewer may approve and apply; preparer may never review or apply. Scoped to journal-period linking only.', 'Alyssa Pettit decision 2026-10-09');

ALTER TABLE public.journal_period_link_batches ADD COLUMN applied_policy_version integer;

CREATE OR REPLACE FUNCTION public.apply_journal_period_link_batch(_batch uuid, _actor uuid, _expected_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _b journal_period_link_batches; _p accounting_periods; _hash text; _n int; _item jsonb; _e journal_entries; _dr bigint; _cr bigint; _pol journal_period_link_policy_versions;
BEGIN
  SELECT * INTO _b FROM journal_period_link_batches WHERE id = _batch FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found.'; END IF;
  IF _b.status = 'applied' THEN RETURN jsonb_build_object('applied', 0, 'idempotent', true, 'batch', _batch); END IF;
  IF _b.status <> 'approved' THEN RAISE EXCEPTION 'PERIOD LINK REFUSED: batch is %, not approved.', _b.status; END IF;
  SELECT * INTO _pol FROM journal_period_link_policy_versions WHERE effective_at <= now() ORDER BY version DESC LIMIT 1;
  IF _actor = _b.prepared_by THEN RAISE EXCEPTION 'SEGREGATION: the preparer cannot apply their own batch.'; END IF;
  IF _actor = _b.reviewed_by AND NOT _pol.reviewer_may_apply THEN RAISE EXCEPTION 'SEGREGATION: policy v% requires a third person to apply.', _pol.version; END IF;
  IF _b.reviewed_by IS NULL OR _b.reviewed_by = _b.prepared_by THEN RAISE EXCEPTION 'SEGREGATION: batch lacks an independent review.'; END IF;
  IF _expected_hash IS DISTINCT FROM _b.proposal_hash THEN RAISE EXCEPTION 'PERIOD LINK REFUSED: the proposal hash does not match the approved proposal.'; END IF;
  SELECT * INTO _p FROM accounting_periods WHERE id = _b.period_id FOR UPDATE;
  IF _p.book_id <> _b.book_id THEN RAISE EXCEPTION 'PERIOD LINK REFUSED: period belongs to another book.'; END IF;
  IF _p.status <> 'open' THEN RAISE EXCEPTION 'PERIOD LINK REFUSED: the period is %, not open.', _p.status; END IF;
  SELECT md5(COALESCE(string_agg((x->>'entry_id')||'|'||(x->>'entry_date')||'|'||(x->>'debit_cents')||'|'||(x->>'credit_cents'), ',' ORDER BY x->>'entry_id'), '') || '@' || _b.period_id::text)
    INTO _hash FROM jsonb_array_elements(_b.proposal) x;
  IF _hash <> _b.proposal_hash THEN RAISE EXCEPTION 'PERIOD LINK REFUSED: the stored proposal was altered.'; END IF;
  INSERT INTO journal_period_link_events(batch_id, event, actor_user_id, to_period_id, detail)
    VALUES (_batch, 'revalidated', _actor, _b.period_id, jsonb_build_object('hash', _hash, 'policy_version', _pol.version, 'reviewer_applies', _actor = _b.reviewed_by));
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
  UPDATE journal_period_link_batches SET status = 'applied', applied_by = _actor, applied_at = now(), applied_policy_version = _pol.version WHERE id = _batch;
  INSERT INTO journal_period_link_events(batch_id, event, actor_user_id, to_period_id, detail) VALUES (_batch, 'applied', _actor, _b.period_id, jsonb_build_object('entries', _n, 'policy_version', _pol.version));
  PERFORM set_config('harmonious.period_link_batch', '', true);
  RETURN jsonb_build_object('applied', _n, 'idempotent', false, 'batch', _batch, 'policy_version', _pol.version);
END $$;
REVOKE ALL ON FUNCTION public.apply_journal_period_link_batch(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_journal_period_link_batch(uuid, uuid, text) TO service_role;