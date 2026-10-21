CREATE TABLE public.wealth_service_selections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL, offering_id uuid REFERENCES public.offerings(id), services text[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT wealth_services_allowed CHECK (services <@ ARRAY['portfolio','report_cards']::text[])
);
GRANT SELECT, INSERT ON public.wealth_service_selections TO authenticated;
GRANT ALL ON public.wealth_service_selections TO service_role;
ALTER TABLE public.wealth_service_selections ENABLE ROW LEVEL SECURITY;
CREATE POLICY wealth_selection_owner_read ON public.wealth_service_selections FOR SELECT TO authenticated USING (owner_user_id=auth.uid() AND (offering_id IS NULL OR EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id=wealth_service_selections.offering_id AND fm.user_id=auth.uid())));
CREATE POLICY wealth_selection_owner_insert ON public.wealth_service_selections FOR INSERT TO authenticated WITH CHECK (owner_user_id=auth.uid() AND (offering_id IS NULL OR EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id=wealth_service_selections.offering_id AND fm.user_id=auth.uid())));
CREATE INDEX wealth_selection_scope ON public.wealth_service_selections(owner_user_id,offering_id,created_at DESC);
COMMENT ON TABLE public.wealth_service_selections IS 'Append-only commercial intent only; never activates billing, entitlement, or fund/investor authority. Contracting uses existing quote/SOW engine.';
CREATE TABLE public.personal_wealth_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL, holding_id uuid NOT NULL, supersedes_id uuid REFERENCES public.personal_wealth_observations(id), name text NOT NULL, asset_class text NOT NULL, currency text NOT NULL DEFAULT 'USD', cost_cents bigint, value_cents bigint, as_of date NOT NULL, source_note text NOT NULL, archived boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT personal_wealth_nonnegative CHECK ((cost_cents IS NULL OR cost_cents>=0) AND (value_cents IS NULL OR value_cents>=0)),
 CONSTRAINT personal_wealth_currency CHECK (currency ~ '^[A-Z]{3}$'),
 CONSTRAINT personal_wealth_class CHECK (asset_class IN ('cash','public_equity','fixed_income','private_fund','real_estate','business','other')),
 UNIQUE(supersedes_id)
);
GRANT SELECT, INSERT ON public.personal_wealth_observations TO authenticated;
GRANT ALL ON public.personal_wealth_observations TO service_role;
ALTER TABLE public.personal_wealth_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY personal_wealth_owner_read ON public.personal_wealth_observations FOR SELECT TO authenticated USING (owner_user_id=auth.uid());
CREATE POLICY personal_wealth_owner_insert ON public.personal_wealth_observations FOR INSERT TO authenticated WITH CHECK (owner_user_id=auth.uid());
CREATE INDEX personal_wealth_owner_date ON public.personal_wealth_observations(owner_user_id,as_of DESC);
CREATE OR REPLACE FUNCTION public.guard_personal_wealth_history() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE prior public.personal_wealth_observations;
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Wealth history is immutable; append a correction.'; END IF;
 IF NEW.supersedes_id IS NOT NULL THEN
 SELECT * INTO prior FROM public.personal_wealth_observations WHERE id=NEW.supersedes_id;
 IF NOT FOUND OR prior.owner_user_id<>NEW.owner_user_id OR prior.holding_id<>NEW.holding_id THEN RAISE EXCEPTION 'Prior holding does not match owner.'; END IF;
 IF NEW.as_of<prior.as_of THEN RAISE EXCEPTION 'Correction date precedes previous observation.'; END IF;
 ELSE
 IF EXISTS(SELECT 1 FROM public.personal_wealth_observations WHERE holding_id=NEW.holding_id) THEN RAISE EXCEPTION 'Existing holding requires a prior observation.'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER personal_wealth_history_guard BEFORE INSERT OR UPDATE OR DELETE ON public.personal_wealth_observations FOR EACH ROW EXECUTE FUNCTION public.guard_personal_wealth_history();
CREATE TRIGGER wealth_selection_history_guard BEFORE UPDATE OR DELETE ON public.wealth_service_selections FOR EACH ROW EXECUTE FUNCTION public.report_card_history_guard();
COMMENT ON TABLE public.personal_wealth_observations IS 'Owner-recorded personal holdings observations only, never approved fund marks, ledger entries, capital accounts, or investment recommendations.';
ALTER TABLE public.report_card_versions DROP CONSTRAINT report_card_versions_subject_type_check;
ALTER TABLE public.report_card_versions ADD CONSTRAINT report_card_versions_subject_type_check CHECK(subject_type IN ('fund','client','administrator','profile','individual'));
ALTER TABLE public.report_card_versions DROP CONSTRAINT report_card_versions_check1;
ALTER TABLE public.report_card_versions ADD CONSTRAINT report_card_versions_check1 CHECK ((kind='investor' AND subject_type IN ('profile','individual')) OR (kind='diligence' AND subject_type='fund' AND offering_id=subject_id) OR (kind='operational' AND subject_type IN ('fund','client','administrator')));