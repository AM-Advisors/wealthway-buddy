ALTER TABLE public.service_engagements DROP CONSTRAINT IF EXISTS service_engagements_service_level_check;
ALTER TABLE public.service_engagements ADD CONSTRAINT service_engagements_service_level_check CHECK (service_level IN ('CORE','PLUS','FUND_ADMINISTRATION','WHITE_GLOVE','INSTITUTIONAL'));
ALTER TABLE public.service_pricing_versions DROP CONSTRAINT IF EXISTS service_pricing_versions_service_level_check;
ALTER TABLE public.service_pricing_versions ADD CONSTRAINT service_pricing_versions_service_level_check CHECK (service_level IN ('CORE','PLUS','FUND_ADMINISTRATION','WHITE_GLOVE','INSTITUTIONAL'));

CREATE OR REPLACE FUNCTION public.validate_service_ladder() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.service_product = 'SPV_ADMINISTRATION' AND NEW.service_level NOT IN ('CORE','PLUS','WHITE_GLOVE') THEN
    RAISE EXCEPTION 'SPV Administration levels are Core, Plus or White Glove';
  ELSIF NEW.service_product = 'FUND_ADMINISTRATION' AND NEW.service_level NOT IN ('CORE','FUND_ADMINISTRATION','WHITE_GLOVE','INSTITUTIONAL') THEN
    RAISE EXCEPTION 'Fund Administration levels are Core, Fund Administration, White Glove or Institutional';
  ELSIF NEW.service_level = 'PLUS' AND NEW.service_product <> 'SPV_ADMINISTRATION' THEN
    RAISE EXCEPTION 'Plus is only an SPV Administration level';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS service_engagements_ladder ON public.service_engagements;
CREATE TRIGGER service_engagements_ladder BEFORE INSERT OR UPDATE OF service_product, service_level ON public.service_engagements FOR EACH ROW EXECUTE FUNCTION public.validate_service_ladder();
DROP TRIGGER IF EXISTS service_pricing_ladder ON public.service_pricing_versions;
CREATE TRIGGER service_pricing_ladder BEFORE INSERT OR UPDATE OF service_product, service_level ON public.service_pricing_versions FOR EACH ROW EXECUTE FUNCTION public.validate_service_ladder();
DROP TRIGGER IF EXISTS service_level_entitlements_ladder ON public.service_level_entitlements;
CREATE TRIGGER service_level_entitlements_ladder BEFORE INSERT OR UPDATE ON public.service_level_entitlements FOR EACH ROW EXECUTE FUNCTION public.validate_service_ladder();