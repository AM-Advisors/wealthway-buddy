CREATE OR REPLACE FUNCTION public.validate_service_ladder()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.service_product = 'SPV_ADMINISTRATION' AND NEW.service_level NOT IN ('SELF_SERVE','SAAS','CORE','PLUS','WHITE_GLOVE') THEN
    RAISE EXCEPTION 'SPV Administration levels are Self Serve, SaaS, Core, Plus or White Glove';
  ELSIF NEW.service_product = 'FUND_ADMINISTRATION' AND NEW.service_level NOT IN ('SELF_SERVE','SAAS','CORE','FUND_ADMINISTRATION','WHITE_GLOVE','INSTITUTIONAL') THEN
    RAISE EXCEPTION 'Fund Administration levels are Self Serve, SaaS, Core, Fund Administration, White Glove or Institutional';
  ELSIF NEW.service_level = 'PLUS' AND NEW.service_product <> 'SPV_ADMINISTRATION' THEN
    RAISE EXCEPTION 'Plus is only an SPV Administration level';
  END IF;
  RETURN NEW;
END $function$;