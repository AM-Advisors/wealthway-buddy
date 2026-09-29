-- Phase 3.5: Fund name uniqueness, rename history, and investor-record sync review items.

CREATE OR REPLACE FUNCTION public.normalize_fund_name(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT nullif(btrim(regexp_replace(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g')), '')
$$;

ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS name_normalized text GENERATED ALWAYS AS (public.normalize_fund_name(name)) STORED;
CREATE INDEX IF NOT EXISTS offerings_name_normalized_idx ON public.offerings (name_normalized);
CREATE INDEX IF NOT EXISTS offerings_legal_name_normalized_idx ON public.offerings (public.normalize_fund_name(legal_entity_name));

-- Server/database authority: serialize on the normalized name so two simultaneous
-- requests can never both create the same Fund. Pre-existing duplicate pairs are
-- left untouched (surfaced for review) and only new collisions are rejected.
CREATE OR REPLACE FUNCTION public.guard_unique_fund_name()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
   WHERE public.normalize_fund_name(name) = n AND id <> NEW.id LIMIT 1;
  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate_fund_name:%', hit USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS offerings_unique_fund_name ON public.offerings;
CREATE TRIGGER offerings_unique_fund_name
  BEFORE INSERT OR UPDATE OF name ON public.offerings
  FOR EACH ROW EXECUTE FUNCTION public.guard_unique_fund_name();

-- Append-only display-name history (Legal Name already has its own history).
CREATE TABLE IF NOT EXISTS public.offering_name_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE RESTRICT,
  previous_name text NOT NULL,
  new_name text NOT NULL,
  effective_date date NOT NULL DEFAULT current_date,
  reason text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.offering_name_history TO authenticated;
GRANT ALL ON public.offering_name_history TO service_role;
ALTER TABLE public.offering_name_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read fund name history" ON public.offering_name_history
  FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE OR REPLACE FUNCTION public.block_offering_name_history_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Fund name history is append-only.'; END $$;
CREATE TRIGGER offering_name_history_append_only
  BEFORE UPDATE OR DELETE ON public.offering_name_history
  FOR EACH ROW EXECUTE FUNCTION public.block_offering_name_history_mutation();

CREATE OR REPLACE FUNCTION public.record_offering_rename()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    INSERT INTO public.offering_name_history (offering_id, previous_name, new_name, effective_date, reason, actor_id)
    VALUES (NEW.id, OLD.name, NEW.name,
      coalesce(nullif(current_setting('harmonious.rename_effective', true), '')::date, current_date),
      nullif(current_setting('harmonious.rename_reason', true), ''),
      coalesce(auth.uid(), nullif(current_setting('harmonious.rename_actor', true), '')::uuid));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS offerings_record_rename ON public.offerings;
CREATE TRIGGER offerings_record_rename
  AFTER UPDATE OF name ON public.offerings
  FOR EACH ROW EXECUTE FUNCTION public.record_offering_rename();

-- Investor Records Sync: reconciliation runs and review items (never an import).
CREATE TABLE IF NOT EXISTS public.fund_record_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE RESTRICT,
  actor_id uuid,
  drive_checked boolean NOT NULL DEFAULT false,
  drive_note text,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_record_sync_runs TO service_role;
ALTER TABLE public.fund_record_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.fund_record_sync_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid REFERENCES public.offerings(id) ON DELETE RESTRICT,
  item_key text NOT NULL,
  category text NOT NULL,
  confidence text,
  queue_kind text NOT NULL,
  title text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'sync',
  source_ref text,
  onboarding_id uuid,
  investment_profile_id uuid,
  person_id uuid,
  status text NOT NULL DEFAULT 'open',
  resolution text,
  resolution_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_run_id uuid REFERENCES public.fund_record_sync_runs(id),
  CONSTRAINT fund_record_sync_items_status_chk CHECK (status IN ('open','later','in_progress','resolved','dismissed')),
  CONSTRAINT fund_record_sync_items_key UNIQUE (item_key)
);
CREATE INDEX IF NOT EXISTS fund_record_sync_items_offering_idx ON public.fund_record_sync_items (offering_id, status);
GRANT ALL ON public.fund_record_sync_items TO service_role;
ALTER TABLE public.fund_record_sync_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.fund_record_sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid,
  item_id uuid,
  event text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_record_sync_events TO service_role;
ALTER TABLE public.fund_record_sync_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER fund_record_sync_events_append_only
  BEFORE UPDATE OR DELETE ON public.fund_record_sync_events
  FOR EACH ROW EXECUTE FUNCTION public.block_offering_name_history_mutation();