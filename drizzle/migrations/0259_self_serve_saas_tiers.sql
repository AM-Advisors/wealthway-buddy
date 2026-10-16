ALTER TABLE public.service_engagements DROP CONSTRAINT service_engagements_service_level_check;
ALTER TABLE public.service_engagements ADD CONSTRAINT service_engagements_service_level_check CHECK (service_level = ANY (ARRAY['SELF_SERVE','SAAS','CORE','PLUS','FUND_ADMINISTRATION','WHITE_GLOVE','INSTITUTIONAL']));
ALTER TABLE public.service_pricing_versions DROP CONSTRAINT service_pricing_versions_service_level_check;
ALTER TABLE public.service_pricing_versions ADD CONSTRAINT service_pricing_versions_service_level_check CHECK (service_level = ANY (ARRAY['SELF_SERVE','SAAS','CORE','PLUS','FUND_ADMINISTRATION','WHITE_GLOVE','INSTITUTIONAL']));
ALTER TABLE public.pricing_items ADD COLUMN IF NOT EXISTS saas_amount_cents bigint;
COMMENT ON COLUMN public.pricing_items.saas_amount_cents IS 'À la carte price for SaaS (no-support) clients; null = same rule as amount_cents × SaaS markup.';
ALTER TABLE public.offerings ADD COLUMN IF NOT EXISTS service_tier text NOT NULL DEFAULT 'SELF_SERVE';
ALTER TABLE public.offerings ADD CONSTRAINT offerings_service_tier_check CHECK (service_tier = ANY (ARRAY['SELF_SERVE','SAAS','CORE','PLUS','WHITE_GLOVE','INSTITUTIONAL']));
COMMENT ON COLUMN public.offerings.service_tier IS 'Servicing / SLA tier, chosen independently of the fund product. SELF_SERVE is included in the base fund price.';