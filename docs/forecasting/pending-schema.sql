-- Forecasts are service-role only; all reads and writes are authorized server-side.
INSERT INTO public.service_catalog(key,name,category,description,default_pricing_model,sort_order)
VALUES ('forecasting','Forecasting — price to be confirmed','add_on','Paid, subject-specific projections; approved quote required. Placeholder price: to be confirmed.','custom',160)
ON CONFLICT(key) DO NOTHING;
CREATE TABLE public.forecasts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject_type text NOT NULL CHECK(subject_type IN ('cap_table','portfolio','fund')), subject_id uuid NOT NULL, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160), created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.forecast_scenarios(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),forecast_id uuid NOT NULL REFERENCES public.forecasts(id),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.forecast_scenario_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scenario_id uuid NOT NULL REFERENCES public.forecast_scenarios(id), assumptions jsonb NOT NULL,results jsonb NOT NULL,canonical_snapshot jsonb NOT NULL,actor_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.forecast_share_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scenario_id uuid NOT NULL REFERENCES public.forecast_scenarios(id),version_id uuid NOT NULL REFERENCES public.forecast_scenario_versions(id),shared boolean NOT NULL,actor_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.forecasts,public.forecast_scenarios,public.forecast_scenario_versions,public.forecast_share_events TO service_role;
REVOKE ALL ON public.forecasts,public.forecast_scenarios,public.forecast_scenario_versions,public.forecast_share_events FROM anon,authenticated;
ALTER TABLE public.forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_scenario_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_share_events ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.forecast_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Forecast history is append-only'; END $$;
CREATE TRIGGER forecast_versions_immutable BEFORE UPDATE OR DELETE ON public.forecast_scenario_versions FOR EACH ROW EXECUTE FUNCTION public.forecast_immutable();
CREATE TRIGGER forecast_shares_immutable BEFORE UPDATE OR DELETE ON public.forecast_share_events FOR EACH ROW EXECUTE FUNCTION public.forecast_immutable();
CREATE INDEX ON public.forecasts(subject_type,subject_id);
CREATE INDEX ON public.forecast_scenarios(forecast_id);
CREATE INDEX ON public.forecast_scenario_versions(scenario_id,created_at DESC);
CREATE INDEX ON public.forecast_share_events(scenario_id,created_at DESC);
