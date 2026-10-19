CREATE TABLE public.portfolio_monitoring_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_id uuid NOT NULL REFERENCES public.portfolio_assets(id), offering_id uuid NOT NULL REFERENCES public.offerings(id), actor_id uuid NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.portfolio_monitoring_versions TO service_role;
ALTER TABLE public.portfolio_monitoring_versions ENABLE ROW LEVEL SECURITY;
CREATE INDEX portfolio_monitoring_asset_history ON public.portfolio_monitoring_versions(asset_id, created_at DESC);
CREATE TABLE public.report_card_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK (kind IN ('operational','diligence','investor')), subject_type text NOT NULL CHECK (subject_type IN ('fund','client','administrator','profile')), subject_id uuid NOT NULL, offering_id uuid REFERENCES public.offerings(id), author_id uuid NOT NULL, supersedes_id uuid REFERENCES public.report_card_versions(id), period_start date NOT NULL, period_end date NOT NULL, summary text NOT NULL DEFAULT '', metrics jsonb NOT NULL DEFAULT '[]', answers jsonb NOT NULL DEFAULT '{}', investor_visible boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), CHECK(period_end >= period_start), CHECK((kind = 'investor' AND subject_type = 'profile') OR (kind = 'diligence' AND subject_type = 'fund' AND offering_id = subject_id) OR (kind = 'operational' AND subject_type IN ('fund','client','administrator')))
);
GRANT ALL ON public.report_card_versions TO service_role;
ALTER TABLE public.report_card_versions ENABLE ROW LEVEL SECURITY;
CREATE INDEX report_card_subject_history ON public.report_card_versions(kind,subject_id,created_at DESC);
CREATE TABLE public.report_card_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), card_id uuid NOT NULL REFERENCES public.report_card_versions(id), file_name text NOT NULL, content_type text NOT NULL CHECK(content_type IN ('application/pdf','image/png','image/jpeg','text/plain')), content_base64 text NOT NULL CHECK(length(content_base64) <= 7000000), uploaded_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.report_card_evidence TO service_role;
ALTER TABLE public.report_card_evidence ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.report_card_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), card_id uuid NOT NULL REFERENCES public.report_card_versions(id), actor_id uuid NOT NULL, decision text NOT NULL CHECK(decision IN ('published','returned')), reason text NOT NULL DEFAULT '', override_id uuid REFERENCES public.self_approval_overrides(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(card_id)
);
GRANT ALL ON public.report_card_decisions TO service_role;
ALTER TABLE public.report_card_decisions ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.report_card_configuration_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL, weights jsonb NOT NULL DEFAULT '{}', thresholds jsonb NOT NULL, reason text NOT NULL CHECK(length(trim(reason)) >= 10), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.report_card_configuration_versions TO service_role;
ALTER TABLE public.report_card_configuration_versions ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.report_card_history_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN RAISE EXCEPTION 'Report card and monitoring history is immutable; create a new version'; END; $$;
CREATE TRIGGER portfolio_monitoring_immutable BEFORE UPDATE OR DELETE ON public.portfolio_monitoring_versions FOR EACH ROW EXECUTE FUNCTION public.report_card_history_guard();
CREATE TRIGGER report_card_versions_immutable BEFORE UPDATE OR DELETE ON public.report_card_versions FOR EACH ROW EXECUTE FUNCTION public.report_card_history_guard();
CREATE TRIGGER report_card_evidence_immutable BEFORE UPDATE OR DELETE ON public.report_card_evidence FOR EACH ROW EXECUTE FUNCTION public.report_card_history_guard();
CREATE TRIGGER report_card_decisions_immutable BEFORE UPDATE OR DELETE ON public.report_card_decisions FOR EACH ROW EXECUTE FUNCTION public.report_card_history_guard();
CREATE TRIGGER report_card_configuration_immutable BEFORE UPDATE OR DELETE ON public.report_card_configuration_versions FOR EACH ROW EXECUTE FUNCTION public.report_card_history_guard();
CREATE OR REPLACE FUNCTION public.report_card_decision_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v public.report_card_versions; BEGIN
 SELECT * INTO v FROM public.report_card_versions WHERE id = NEW.card_id;
 IF v.kind = 'investor' THEN RAISE EXCEPTION 'Investor questionnaires do not use publication approvals'; END IF;
 IF NEW.actor_id = v.author_id AND NOT EXISTS (SELECT 1 FROM public.self_approval_overrides o JOIN public.user_roles r ON r.user_id = o.user_id AND r.role = 'super_admin' WHERE o.id = NEW.override_id AND o.user_id = NEW.actor_id AND o.action = 'report_card_publish' AND v.id = ANY(o.record_ids) AND o.created_at > now() - interval '5 minutes' AND length(trim(o.reason)) >= 10) THEN RAISE EXCEPTION 'A different approver is required'; END IF;
 IF NEW.decision = 'published' AND (NOT EXISTS(SELECT 1 FROM public.report_card_evidence WHERE card_id = v.id) OR jsonb_array_length(v.metrics) = 0) THEN RAISE EXCEPTION 'Publication requires assessment metrics and attached evidence'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER report_card_decision_validate BEFORE INSERT ON public.report_card_decisions FOR EACH ROW EXECUTE FUNCTION public.report_card_decision_guard();
CREATE OR REPLACE FUNCTION public.report_card_evidence_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.report_card_decisions WHERE card_id = NEW.card_id) THEN RAISE EXCEPTION 'Decided evidence is frozen'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.report_card_versions WHERE id = NEW.card_id AND author_id = NEW.uploaded_by AND kind <> 'investor') THEN RAISE EXCEPTION 'Only the author can attach assessment evidence'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER report_card_evidence_validate BEFORE INSERT ON public.report_card_evidence FOR EACH ROW EXECUTE FUNCTION public.report_card_evidence_guard();