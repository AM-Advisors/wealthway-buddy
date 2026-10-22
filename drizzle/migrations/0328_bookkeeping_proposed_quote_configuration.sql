CREATE TABLE public.bookkeeping_config_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), configuration jsonb NOT NULL, effective_on date NOT NULL, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL CHECK(length(trim(reason))>=3), publication_status text NOT NULL DEFAULT 'proposed' CHECK(publication_status='proposed')
);
GRANT ALL ON public.bookkeeping_config_versions TO service_role;
ALTER TABLE public.bookkeeping_config_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_quote_lines ADD COLUMN bookkeeping_snapshot jsonb;
CREATE FUNCTION public.bookkeeping_configuration_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Bookkeeping configuration is append-only; create a new proposed version'; END $$;
CREATE TRIGGER bookkeeping_configuration_immutable BEFORE UPDATE OR DELETE ON public.bookkeeping_config_versions FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_configuration_immutable();
CREATE FUNCTION public.bookkeeping_proposed_quote_gate() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NEW.status IN ('pending_approval','approved','sent','signed') AND EXISTS(SELECT 1 FROM public.sales_quote_lines WHERE quote_id=NEW.id AND bookkeeping_snapshot IS NOT NULL) THEN RAISE EXCEPTION 'Proposed bookkeeping cannot be approved or sent until a separately approved release'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bookkeeping_proposed_quote_gate BEFORE UPDATE ON public.sales_quotes FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_proposed_quote_gate();
CREATE FUNCTION public.bookkeeping_proposed_line_gate() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NEW.bookkeeping_snapshot IS NOT NULL THEN
 IF NEW.service_key<>'BOOKKEEPING_ACCOUNTING' OR NOT EXISTS(SELECT 1 FROM public.sales_quotes WHERE id=NEW.quote_id AND status IN ('draft','rejected')) THEN RAISE EXCEPTION 'Proposed bookkeeping may only be attached to drafts'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bookkeeping_config_versions WHERE id=(NEW.bookkeeping_snapshot->>'configVersionId')::uuid) THEN RAISE EXCEPTION 'Bookkeeping requires a recorded configuration version'; END IF;
 END IF;
 IF NEW.service_key='BOOKKEEPING_ACCOUNTING' AND NEW.bookkeeping_snapshot IS NULL THEN RAISE EXCEPTION 'Bookkeeping requires a configuration snapshot'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bookkeeping_proposed_line_gate BEFORE INSERT OR UPDATE ON public.sales_quote_lines FOR EACH ROW EXECUTE FUNCTION public.bookkeeping_proposed_line_gate();
COMMENT ON TABLE public.bookkeeping_config_versions IS 'Internal proposed configuration only. Publication, customer enrollment and live billing intentionally disabled pending release approval and isolated QA.';
COMMENT ON COLUMN public.sales_quote_lines.bookkeeping_snapshot IS 'Exact validated proposed bookkeeping terms; draft only, not authority for enrollment, invoices or money movement.';