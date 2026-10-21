CREATE TABLE public.personal_wealth_financial_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL, record_id uuid NOT NULL, supersedes_id uuid REFERENCES public.personal_wealth_financial_records(id), kind text NOT NULL CHECK (kind IN ('liability','inflow','outflow')), name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160), currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'), amount_cents bigint NOT NULL CHECK (amount_cents >= 0 AND amount_cents <= 9007199254740991), effective_date date NOT NULL, source_note text NOT NULL CHECK (length(source_note) BETWEEN 3 AND 1000), archived boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(supersedes_id)
);
GRANT SELECT, INSERT ON public.personal_wealth_financial_records TO authenticated;
GRANT ALL ON public.personal_wealth_financial_records TO service_role;
ALTER TABLE public.personal_wealth_financial_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY wealth_financial_owner_read ON public.personal_wealth_financial_records FOR SELECT TO authenticated USING(owner_user_id=auth.uid());
CREATE POLICY wealth_financial_owner_insert ON public.personal_wealth_financial_records FOR INSERT TO authenticated WITH CHECK(owner_user_id=auth.uid());
CREATE INDEX wealth_financial_owner_date ON public.personal_wealth_financial_records(owner_user_id,effective_date DESC);
CREATE FUNCTION public.guard_wealth_financial_history() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE prior public.personal_wealth_financial_records;
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Financial history is immutable; append a correction.'; END IF;
 IF NEW.supersedes_id IS NOT NULL THEN
 SELECT * INTO prior FROM public.personal_wealth_financial_records WHERE id=NEW.supersedes_id;
 IF NOT FOUND OR prior.owner_user_id<>NEW.owner_user_id OR prior.record_id<>NEW.record_id OR prior.kind<>NEW.kind THEN RAISE EXCEPTION 'Correction must match owner, record and kind.'; END IF;
 IF NEW.effective_date<prior.effective_date THEN RAISE EXCEPTION 'Correction cannot precede prior record.'; END IF;
 ELSE
 IF EXISTS(SELECT 1 FROM public.personal_wealth_financial_records WHERE record_id=NEW.record_id) THEN RAISE EXCEPTION 'Existing record requires prior observation.'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER wealth_financial_history_guard BEFORE INSERT OR UPDATE OR DELETE ON public.personal_wealth_financial_records FOR EACH ROW EXECUTE FUNCTION public.guard_wealth_financial_history();
COMMENT ON TABLE public.personal_wealth_financial_records IS 'Private owner-recorded debt balances and actual personal cash activity; append-only corrections, never instructions, fund books or money movement.';