CREATE OR REPLACE FUNCTION public.post_distribution_payment_atomic(
  _payment_id uuid,
  _actor uuid,
  _apply_capital boolean,
  _reduce_capital_cents bigint,
  _gross_cents bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record; j record; l record;
  v_debits bigint; v_credits bigint;
  v_event uuid := NULL;
  v_now timestamptz := now();
  v_return_of_capital boolean;
  v_open int;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'A human poster is required.'; END IF;
  SELECT * INTO p FROM distribution_payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That payment was not found.'; END IF;
  IF p.posted_at IS NOT NULL THEN RAISE EXCEPTION 'This payment is already posted.'; END IF;
  IF p.reconciliation_id IS NULL THEN RAISE EXCEPTION 'This payment has not been reconciled.'; END IF;
  IF p.sent_on IS NULL THEN RAISE EXCEPTION 'Record the payment sent date before posting.'; END IF;
  IF p.journal_entry_id IS NULL THEN RAISE EXCEPTION 'No journal has been prepared for this payment.'; END IF;

  SELECT * INTO j FROM journal_entries WHERE id = p.journal_entry_id FOR UPDATE;
  IF j.status::text <> 'approved' THEN RAISE EXCEPTION 'The payment journal is %; it cannot be posted.', j.status; END IF;
  IF j.approved_by = _actor THEN RAISE EXCEPTION 'Maker/checker: the person who approved the payment journal cannot also post it.'; END IF;
  SELECT coalesce(sum(debit_cents),0), coalesce(sum(credit_cents),0) INTO v_debits, v_credits FROM journal_lines WHERE entry_id = j.id;
  IF v_debits <> v_credits OR v_debits = 0 THEN RAISE EXCEPTION 'The payment journal does not balance.'; END IF;

  SELECT * INTO l FROM distribution_lines WHERE id = p.distribution_line_id FOR UPDATE;
  v_return_of_capital := coalesce(l.distribution_type::text, '') = 'return_of_capital';

  UPDATE journal_entries SET status = 'posted', posted_by = _actor, posted_at = v_now, updated_at = v_now WHERE id = j.id;
  INSERT INTO journal_entry_events (entry_id, actor_user_id, from_status, to_status, reason)
    VALUES (j.id, _actor, j.status, 'posted', 'Distribution payment posted');
  UPDATE bank_reconciliations SET status = 'posted', posted_at = v_now, updated_at = v_now
    WHERE id = p.reconciliation_id AND status <> 'posted';

  IF _apply_capital AND l.position_id IS NOT NULL THEN
    INSERT INTO commitment_events (position_id, offering_id, event_type, amount_cents, effective_date, source, source_ref, journal_entry_id, dedupe_key, recorded_by)
    VALUES (l.position_id, p.offering_id, CASE WHEN v_return_of_capital THEN 'return_of_capital' ELSE 'distribution' END,
            _reduce_capital_cents, p.sent_on, 'distribution_payment', p.id::text, p.journal_entry_id,
            'distribution_payment:' || p.id::text, _actor)
    RETURNING id INTO v_event;
  END IF;

  UPDATE distribution_payments SET posted_at = v_now, posted_by = _actor, commitment_event_id = v_event, updated_at = v_now WHERE id = p.id;
  UPDATE distribution_payments SET settled_at = v_now WHERE id = p.id;

  INSERT INTO fund_distributions (offering_id, paid_on, amount_cents, kind, note, created_by, distribution_payment_id)
  VALUES (p.offering_id, p.sent_on, coalesce(_gross_cents, p.submitted_amount_cents),
          CASE WHEN v_return_of_capital THEN 'return_of_capital' ELSE 'distribution' END,
          'Distribution payment ' || p.id::text, _actor, p.id);

  UPDATE distribution_lines SET accounting_state = 'posted' WHERE id = p.distribution_line_id;

  SELECT count(*) INTO v_open FROM distribution_lines WHERE batch_id = p.batch_id AND coalesce(accounting_state::text, '') <> 'posted';
  IF v_open = 0 THEN
    UPDATE distribution_batches SET status = 'completed', payment_status = 'confirmed', completed_at = v_now WHERE id = p.batch_id;
  END IF;

  RETURN jsonb_build_object('commitmentEventId', v_event, 'batchCompleted', v_open = 0);
END;
$$;

REVOKE ALL ON FUNCTION public.post_distribution_payment_atomic(uuid, uuid, boolean, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_distribution_payment_atomic(uuid, uuid, boolean, bigint, bigint) TO service_role;