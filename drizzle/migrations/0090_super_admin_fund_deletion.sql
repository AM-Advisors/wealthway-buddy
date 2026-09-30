CREATE TABLE public.fund_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL,
  fund_name text NOT NULL,
  actor_user_id uuid NOT NULL,
  reason text NOT NULL,
  impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_deletion_log TO service_role;
ALTER TABLE public.fund_deletion_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_fund_deletion_log_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Fund deletion log is append-only'; END $$;
CREATE TRIGGER fund_deletion_log_append_only BEFORE UPDATE OR DELETE ON public.fund_deletion_log
FOR EACH ROW EXECUTE FUNCTION public.block_fund_deletion_log_mutation();

CREATE OR REPLACE FUNCTION public.fund_deletion_impact(p_offering_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'applications', (SELECT count(*) FROM investor_applications WHERE offering_id = p_offering_id),
    'funded', (SELECT count(*) FROM investor_applications WHERE offering_id = p_offering_id AND (funding_status::text = 'settled' OR status::text = 'funded')),
    'documents', (SELECT count(*) FROM offering_documents WHERE offering_id = p_offering_id),
    'retired_into', (SELECT count(*) FROM offerings WHERE consolidated_into = p_offering_id)
  )
$$;
REVOKE ALL ON FUNCTION public.fund_deletion_impact(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fund_deletion_impact(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.super_admin_delete_fund(p_offering_id uuid, p_actor uuid, p_reason text, p_confirm_name text, p_allow_funded boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_name text; v_impact jsonb; r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = p_actor AND role::text = 'super_admin') THEN
    RAISE EXCEPTION 'Only Super Administrators can delete funds';
  END IF;
  SELECT name INTO v_name FROM offerings WHERE id = p_offering_id FOR UPDATE;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Fund not found'; END IF;
  IF p_confirm_name IS DISTINCT FROM v_name THEN RAISE EXCEPTION 'Typed name does not match the fund name'; END IF;
  IF length(coalesce(trim(p_reason),'')) < 5 THEN RAISE EXCEPTION 'A reason is required'; END IF;
  v_impact := fund_deletion_impact(p_offering_id);
  IF (v_impact->>'funded')::int > 0 AND NOT p_allow_funded THEN
    RAISE EXCEPTION 'This fund has funded investments; confirm deleting them to continue';
  END IF;
  IF (v_impact->>'retired_into')::int > 0 THEN
    RAISE EXCEPTION 'Other retired funds were consolidated into this fund; it cannot be deleted';
  END IF;

  INSERT INTO fund_deletion_log(offering_id, fund_name, actor_user_id, reason, impact)
  VALUES (p_offering_id, v_name, p_actor, trim(p_reason), v_impact);

  FOR r IN SELECT t.tgrelid::regclass AS tbl, t.tgname FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
      JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname IN ('public','private') AND t.tgrelid <> 'public.fund_deletion_log'::regclass
      AND (p.proname LIKE 'block_%' OR p.proname LIKE 'protect_%' OR p.proname LIKE 'guard_%' OR t.tgname LIKE '%append_only%' OR t.tgname LIKE '%immutable%' OR t.tgname LIKE '%no_delete%' OR t.tgname LIKE '%protect%')
  LOOP EXECUTE format('ALTER TABLE %s DISABLE TRIGGER %I', r.tbl, r.tgname); END LOOP;

  FOR r IN SELECT c.conrelid::regclass AS tbl, a.attname AS col, a.attnotnull AS nn
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
    WHERE c.contype='f' AND c.confrelid='public.offerings'::regclass AND c.confdeltype IN ('a','r') AND c.conrelid <> 'public.offerings'::regclass
  LOOP
    IF r.nn THEN EXECUTE format('DELETE FROM %s WHERE %I = $1', r.tbl, r.col) USING p_offering_id;
    ELSE EXECUTE format('UPDATE %s SET %I = NULL WHERE %I = $1', r.tbl, r.col, r.col) USING p_offering_id; END IF;
  END LOOP;

  DELETE FROM offerings WHERE id = p_offering_id;

  FOR r IN SELECT t.tgrelid::regclass AS tbl, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname IN ('public','private') AND t.tgenabled='D'
  LOOP EXECUTE format('ALTER TABLE %s ENABLE TRIGGER %I', r.tbl, r.tgname); END LOOP;

  RETURN jsonb_build_object('deleted', p_offering_id, 'name', v_name, 'impact', v_impact);
END $$;
REVOKE ALL ON FUNCTION public.super_admin_delete_fund(uuid, uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_delete_fund(uuid, uuid, text, text, boolean) TO service_role;