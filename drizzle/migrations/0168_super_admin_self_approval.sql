CREATE TABLE public.self_approval_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  record_ids uuid[] NOT NULL DEFAULT '{}',
  reason text NOT NULL CHECK (length(trim(reason)) >= 10),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.self_approval_overrides TO service_role;
ALTER TABLE public.self_approval_overrides ENABLE ROW LEVEL SECURITY;
CREATE INDEX self_approval_overrides_records ON public.self_approval_overrides USING gin (record_ids);

CREATE OR REPLACE FUNCTION public.block_self_approval_override_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Self-approval records cannot be changed or deleted'; END; $$;
CREATE TRIGGER self_approval_overrides_append_only BEFORE UPDATE OR DELETE ON public.self_approval_overrides
  FOR EACH ROW EXECUTE FUNCTION public.block_self_approval_override_mutation();

-- True when a Super Admin recorded a reasoned self-approval for one of these records in the last 5 minutes.
CREATE OR REPLACE FUNCTION public.sod_override_active(_ids uuid[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.self_approval_overrides o
    JOIN public.user_roles r ON r.user_id = o.user_id AND r.role = 'super_admin'
    WHERE o.record_ids && _ids AND o.created_at > now() - interval '5 minutes'
  )
$$;
REVOKE EXECUTE ON FUNCTION public.sod_override_active(uuid[]) FROM PUBLIC, anon;

DO $do$
DECLARE
  spec record; def text; newdef text;
BEGIN
  FOR spec IN SELECT * FROM (VALUES
    ('enforce_distribution_payment_duties', 'segregation of duties: the requester or preparer cannot record the payment as sent', 'ARRAY[NEW.id, NEW.batch_id]'),
    ('enforce_distribution_payment_duties', 'segregation of duties: the final approver cannot record the payment as sent', 'ARRAY[NEW.id, NEW.batch_id]'),
    ('enforce_distribution_payment_duties', 'segregation of duties: the reconciler cannot approve their own reconciliation', 'ARRAY[NEW.id, NEW.batch_id]'),
    ('enforce_distribution_payment_duties', 'segregation of duties: the person who recorded the payment cannot post it', 'ARRAY[NEW.id, NEW.batch_id]'),
    ('enforce_distribution_payment_duties', 'segregation of duties: the reversal requester cannot approve the reversal', 'ARRAY[NEW.id, NEW.batch_id]'),
    ('protect_distribution_snapshot', 'segregation of duties: the final approver cannot record the payment as sent', 'ARRAY[NEW.id]'),
    ('review_bank_instruction_version', 'A different person must verify instructions they entered', 'ARRAY[r.id, p_offering_id]'),
    ('protect_financial_review_memo', 'A review memo must be decided by someone other than its preparer.', 'ARRAY[NEW.id]'),
    ('protect_statement_package', 'The reviewer must be different from the preparer', 'ARRAY[NEW.id]'),
    ('protect_template_version', 'a different person must approve a template version', 'ARRAY[NEW.id]'),
    ('protect_capital_statement_review', 'A capital account statement must be reviewed by someone other than the person who produced it.', 'ARRAY[NEW.id]'),
    ('guard_side_letter_change_request', 'The proposer cannot decide their own side letter change', 'ARRAY[NEW.id]')
  ) AS t(fn, msg, ids)
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = spec.fn;
    newdef := replace(def, format('RAISE EXCEPTION %L;', spec.msg),
      format('IF NOT public.sod_override_active(%s::uuid[]) THEN RAISE EXCEPTION %L; END IF;', spec.ids, spec.msg));
    IF newdef = def THEN RAISE EXCEPTION 'Rule not found in %: %', spec.fn, spec.msg; END IF;
    EXECUTE newdef;
  END LOOP;
END $do$;