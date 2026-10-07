CREATE TABLE public.service_pricing_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_product text NOT NULL,
  service_level text NOT NULL CHECK (service_level IN ('CORE','FUND_ADMINISTRATION','WHITE_GLOVE','INSTITUTIONAL')),
  version_name text NOT NULL,
  annual_price numeric, quarterly_price numeric, monthly_price numeric, starting_price numeric,
  display_label text,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE UNIQUE INDEX service_pricing_current_uq ON public.service_pricing_versions(service_product, service_level) WHERE is_current;
GRANT SELECT ON public.service_pricing_versions TO anon, authenticated;
GRANT ALL ON public.service_pricing_versions TO service_role;
ALTER TABLE public.service_pricing_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Current pricing is public" ON public.service_pricing_versions FOR SELECT TO anon, authenticated USING (is_current);

CREATE TABLE public.service_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.service_features TO service_role;
ALTER TABLE public.service_features ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.service_level_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_product text NOT NULL,
  service_level text NOT NULL,
  feature_key text NOT NULL REFERENCES public.service_features(feature_key),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_product, service_level, feature_key)
);
GRANT ALL ON public.service_level_entitlements TO service_role;
ALTER TABLE public.service_level_entitlements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.service_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid REFERENCES public.offerings(id),
  client_id uuid REFERENCES public.clients(id),
  client_engagement_id uuid REFERENCES public.client_engagements(id),
  service_product text NOT NULL,
  service_level text NOT NULL CHECK (service_level IN ('CORE','FUND_ADMINISTRATION','WHITE_GLOVE','INSTITUTIONAL')),
  service_status text NOT NULL DEFAULT 'PROPOSED' CHECK (service_status IN ('PROPOSED','PENDING_AGREEMENT','ACTIVE','PAUSED','CANCELLATION_PENDING','CANCELLED','EXPIRED')),
  pricing_version_id uuid REFERENCES public.service_pricing_versions(id),
  contracted_annual_value numeric,
  billing_frequency text CHECK (billing_frequency IN ('ANNUAL','QUARTERLY','MONTHLY','ONE_TIME','CUSTOM')),
  recurring_invoice_amount numeric,
  currency text NOT NULL DEFAULT 'USD',
  effective_date date, contract_start_date date, contract_end_date date, renewal_date date,
  renewal_type text CHECK (renewal_type IN ('AUTO_RENEW','MANUAL_RENEWAL','FIXED_TERM','MONTH_TO_MONTH','NONE')),
  reporting_frequency text CHECK (reporting_frequency IN ('MONTHLY','QUARTERLY','ANNUAL','CUSTOM')),
  nav_frequency text CHECK (nav_frequency IN ('MONTHLY','QUARTERLY','ANNUAL','CUSTOM')),
  response_sla text,
  primary_administrator_user_id uuid, secondary_administrator_user_id uuid, relationship_lead_user_id uuid,
  accounting_lead_user_id uuid, tax_coordinator_user_id uuid, compliance_coordinator_user_id uuid,
  investor_limit integer, investment_limit integer, entity_limit integer,
  pricing_type text NOT NULL DEFAULT 'CURRENT' CHECK (pricing_type IN ('CURRENT','GRANDFATHERED','NEGOTIATED','PROMOTIONAL','CUSTOM')),
  pricing_override_reason text,
  grandfathered boolean NOT NULL DEFAULT false,
  included_at_no_charge boolean NOT NULL DEFAULT false,
  notes_internal text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid
);
CREATE INDEX service_engagements_fund_idx ON public.service_engagements(fund_id);
CREATE UNIQUE INDEX service_engagements_one_core_spv ON public.service_engagements(fund_id) WHERE service_product = 'SPV_ADMINISTRATION' AND service_level = 'CORE';
GRANT ALL ON public.service_engagements TO service_role;
ALTER TABLE public.service_engagements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.service_engagement_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.service_engagements(id) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.service_features(feature_key),
  mode text NOT NULL CHECK (mode IN ('ADD','REMOVE')),
  limit_override integer,
  frequency_override text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (engagement_id, feature_key)
);
GRANT ALL ON public.service_engagement_entitlements TO service_role;
ALTER TABLE public.service_engagement_entitlements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.service_engagement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.service_engagements(id),
  field text NOT NULL,
  old_value text,
  new_value text,
  reason text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.service_engagement_events TO service_role;
ALTER TABLE public.service_engagement_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_service_engagement_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Service engagement history is append-only'; END $$;
CREATE TRIGGER service_engagement_events_append_only BEFORE UPDATE OR DELETE ON public.service_engagement_events
FOR EACH ROW EXECUTE FUNCTION public.block_service_engagement_event_mutation();

CREATE OR REPLACE FUNCTION public.log_service_engagement_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f text; o text; n text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO service_engagement_events(engagement_id, field, new_value, changed_by)
    VALUES (NEW.id, 'created', NEW.service_product || '/' || NEW.service_level || '/' || NEW.service_status, NEW.created_by);
    RETURN NEW;
  END IF;
  NEW.updated_at := now();
  FOREACH f IN ARRAY ARRAY['service_level','service_status','contracted_annual_value','billing_frequency','recurring_invoice_amount','pricing_type','grandfathered','effective_date','renewal_date','contract_end_date','reporting_frequency','nav_frequency','primary_administrator_user_id','secondary_administrator_user_id','relationship_lead_user_id','accounting_lead_user_id','tax_coordinator_user_id','compliance_coordinator_user_id','investor_limit','investment_limit','entity_limit','pricing_override_reason'] LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', f, f) INTO o, n USING OLD, NEW;
    IF o IS DISTINCT FROM n THEN
      INSERT INTO service_engagement_events(engagement_id, field, old_value, new_value, changed_by)
      VALUES (NEW.id, f, o, n, NEW.updated_by);
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER service_engagements_audit_ins AFTER INSERT ON public.service_engagements FOR EACH ROW EXECUTE FUNCTION public.log_service_engagement_change();
CREATE TRIGGER service_engagements_audit_upd BEFORE UPDATE ON public.service_engagements FOR EACH ROW EXECUTE FUNCTION public.log_service_engagement_change();

-- Task ownership references (future lanes)
ALTER TABLE public.staff_tasks
  ADD COLUMN service_engagement_id uuid REFERENCES public.service_engagements(id),
  ADD COLUMN responsible_party_type text CHECK (responsible_party_type IN ('HARMONIOUS','CLIENT_APPROVAL','CLIENT_INFORMATION','INVESTOR','THIRD_PARTY','COMPLETED')),
  ADD COLUMN responsible_user_id uuid,
  ADD COLUMN responsible_team text,
  ADD COLUMN client_visibility boolean NOT NULL DEFAULT false;

-- Seed reference data
INSERT INTO public.service_pricing_versions(service_product, service_level, version_name, annual_price, quarterly_price, monthly_price, starting_price, display_label, effective_from) VALUES
 ('SPV_ADMINISTRATION','CORE','2026 launch',0,NULL,NULL,NULL,'Included with Harmonious SPV','2026-10-07'),
 ('FUND_ADMINISTRATION','FUND_ADMINISTRATION','2026 launch',20000,5500,2000,NULL,NULL,'2026-10-07'),
 ('FUND_ADMINISTRATION','WHITE_GLOVE','2026 launch',36000,10000,3500,NULL,NULL,'2026-10-07'),
 ('FUND_ADMINISTRATION','INSTITUTIONAL','2026 launch',NULL,NULL,NULL,60000,'Custom','2026-10-07');

INSERT INTO public.service_features(feature_key, name, category) VALUES
 ('INVESTOR_PORTAL','Investor portal','Investor operations'),('KYC_AML','KYC / AML','Investor operations'),
 ('ACCREDITATION','Accreditation','Investor operations'),('SUBSCRIPTION_TRACKING','Subscription tracking','Investor operations'),
 ('INVESTOR_RECORDS','Investor records','Investor operations'),('DOCUMENT_STORAGE','Document storage','Administration'),
 ('BASIC_GL','Basic general ledger','Accounting'),('BASIC_RECONCILIATION','Basic reconciliation','Accounting'),
 ('CONTRIBUTION_TRACKING','Contribution tracking','Accounting'),('DISTRIBUTION_TRACKING','Distribution tracking','Accounting'),
 ('INVESTOR_CAPITAL_BALANCES','Investor capital balances','Accounting'),('TAX_DOCUMENT_DELIVERY','Tax document delivery','Tax'),
 ('GENERAL_LEDGER','Full general ledger','Accounting'),('BANK_RECONCILIATION','Fund bank reconciliation','Accounting'),
 ('INVESTMENT_ACCOUNTING','Investment accounting','Accounting'),('CAPITAL_ACCOUNTS','Capital accounts','Accounting'),
 ('QUARTERLY_NAV','Quarterly NAV','Reporting'),('QUARTERLY_CLOSE','Quarterly close','Accounting'),
 ('MANAGEMENT_FEE_CALC','Management fee calculation','Accounting'),('STANDARD_WATERFALL','Standard waterfall','Accounting'),
 ('CAPITAL_CALL_ADMIN','Capital call administration','Investor operations'),('DISTRIBUTION_ADMIN','Distribution administration','Investor operations'),
 ('INVESTOR_STATEMENTS','Investor statements','Reporting'),('CAPITAL_ACCOUNT_STATEMENTS','Capital account statements','Reporting'),
 ('OPERATING_CALENDAR','Operating calendar','Administration'),('TAX_COORDINATION','Tax coordination','Tax'),
 ('AUDIT_COORDINATION','Audit coordination','Administration'),('FUND_REPORTING','Fund reporting','Reporting'),
 ('DEDICATED_ADMINISTRATOR','Dedicated administrator','Service'),('RELATIONSHIP_LEAD','Relationship lead','Service'),
 ('PRIORITY_SUPPORT','Priority support','Service'),('PROACTIVE_OPERATING_CALENDAR','Proactive operating calendar','Administration'),
 ('MONTHLY_CLOSE','Monthly close','Accounting'),('ENHANCED_MANAGER_REPORTING','Enhanced manager reporting','Reporting'),
 ('INVESTOR_INQUIRY_MANAGEMENT','Investor inquiry administration','Investor operations'),('INVESTOR_EXCEPTION_MANAGEMENT','Investor exception management','Investor operations'),
 ('PROACTIVE_KYC_FOLLOWUP','Proactive KYC follow-up','Investor operations'),('TREASURY_COORDINATION','Treasury coordination','Treasury'),
 ('PROACTIVE_CAPITAL_CALLS','Proactive capital calls','Investor operations'),('PROACTIVE_DISTRIBUTIONS','Proactive distributions','Investor operations'),
 ('REGULATORY_CALENDAR','Regulatory calendar','Compliance'),('ENTITY_COMPLIANCE_CALENDAR','Entity compliance calendar','Compliance'),
 ('GP_APPROVAL_WORKFLOWS','GP approval workflows','Administration'),('EXECUTIVE_DASHBOARD','Executive dashboard','Reporting'),
 ('MANAGED_TASK_QUEUE','Managed task queue','Service'),('MONTHLY_NAV','Monthly NAV','Reporting'),
 ('DEDICATED_TEAM','Dedicated administration team','Service'),('SENIOR_ACCOUNTING_REVIEW','Senior accounting review','Accounting'),
 ('COMPLEX_STRUCTURES','Complex structures','Structure'),('COMPLEX_WATERFALL','Complex waterfalls','Accounting'),
 ('PARALLEL_VEHICLES','Parallel vehicles','Structure'),('MULTIPLE_CLASSES','Multiple classes','Structure'),
 ('CUSTOM_REPORTING','Custom reporting','Reporting'),('INSTITUTIONAL_REPORTING','Institutional investor reporting','Reporting'),
 ('CUSTOM_APPROVALS','Custom approvals','Administration'),('CUSTOM_SLA','Custom SLA','Service'),
 ('API_INTEGRATIONS','API / integrations','Technology'),('CONSOLIDATED_REPORTING','Consolidated reporting','Reporting'),
 ('INTERNATIONAL_INVESTORS','International investor support','Investor operations');

WITH lv(lvl, keys) AS (VALUES
 ('CORE', ARRAY['INVESTOR_PORTAL','KYC_AML','ACCREDITATION','SUBSCRIPTION_TRACKING','INVESTOR_RECORDS','DOCUMENT_STORAGE','BASIC_GL','BASIC_RECONCILIATION','CONTRIBUTION_TRACKING','DISTRIBUTION_TRACKING','INVESTOR_CAPITAL_BALANCES','TAX_DOCUMENT_DELIVERY']),
 ('FUND_ADMINISTRATION', ARRAY['GENERAL_LEDGER','BANK_RECONCILIATION','INVESTMENT_ACCOUNTING','CAPITAL_ACCOUNTS','QUARTERLY_NAV','QUARTERLY_CLOSE','MANAGEMENT_FEE_CALC','STANDARD_WATERFALL','CAPITAL_CALL_ADMIN','DISTRIBUTION_ADMIN','INVESTOR_STATEMENTS','CAPITAL_ACCOUNT_STATEMENTS','OPERATING_CALENDAR','TAX_COORDINATION','AUDIT_COORDINATION','FUND_REPORTING']),
 ('WHITE_GLOVE', ARRAY['DEDICATED_ADMINISTRATOR','RELATIONSHIP_LEAD','PRIORITY_SUPPORT','PROACTIVE_OPERATING_CALENDAR','MONTHLY_CLOSE','ENHANCED_MANAGER_REPORTING','INVESTOR_INQUIRY_MANAGEMENT','INVESTOR_EXCEPTION_MANAGEMENT','PROACTIVE_KYC_FOLLOWUP','TREASURY_COORDINATION','PROACTIVE_CAPITAL_CALLS','PROACTIVE_DISTRIBUTIONS','REGULATORY_CALENDAR','ENTITY_COMPLIANCE_CALENDAR','GP_APPROVAL_WORKFLOWS','EXECUTIVE_DASHBOARD','MANAGED_TASK_QUEUE']),
 ('INSTITUTIONAL', ARRAY['DEDICATED_TEAM','SENIOR_ACCOUNTING_REVIEW','COMPLEX_STRUCTURES','COMPLEX_WATERFALL','PARALLEL_VEHICLES','MULTIPLE_CLASSES','CUSTOM_REPORTING','INSTITUTIONAL_REPORTING','CUSTOM_APPROVALS','CUSTOM_SLA','API_INTEGRATIONS','CONSOLIDATED_REPORTING','INTERNATIONAL_INVESTORS'])
), ord(lvl, n) AS (VALUES ('CORE',1),('FUND_ADMINISTRATION',2),('WHITE_GLOVE',3),('INSTITUTIONAL',4))
INSERT INTO public.service_level_entitlements(service_product, service_level, feature_key)
SELECT CASE WHEN o.lvl = 'CORE' THEN 'SPV_ADMINISTRATION' ELSE 'FUND_ADMINISTRATION' END, o.lvl, unnest(lv.keys)
FROM ord o JOIN ord src ON src.n <= o.n JOIN lv ON lv.lvl = src.lvl;

-- Core engagement for every SPV (new and existing)
CREATE OR REPLACE FUNCTION public.ensure_core_spv_engagement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(NEW.fund_type,'') ILIKE '%spv%' THEN
    INSERT INTO service_engagements(fund_id, client_id, service_product, service_level, service_status, pricing_version_id, contracted_annual_value, included_at_no_charge, effective_date)
    SELECT NEW.id, NEW.client_id, 'SPV_ADMINISTRATION', 'CORE', 'ACTIVE', p.id, 0, true, current_date
    FROM service_pricing_versions p WHERE p.service_product='SPV_ADMINISTRATION' AND p.service_level='CORE' AND p.is_current
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER offerings_core_spv_engagement AFTER INSERT OR UPDATE OF fund_type ON public.offerings FOR EACH ROW EXECUTE FUNCTION public.ensure_core_spv_engagement();

INSERT INTO public.service_engagements(fund_id, client_id, service_product, service_level, service_status, pricing_version_id, contracted_annual_value, included_at_no_charge, effective_date)
SELECT o.id, o.client_id, 'SPV_ADMINISTRATION', 'CORE', 'ACTIVE', p.id, 0, true, o.created_at::date
FROM public.offerings o CROSS JOIN public.service_pricing_versions p
WHERE coalesce(o.fund_type,'') ILIKE '%spv%' AND o.consolidated_into IS NULL
  AND p.service_product='SPV_ADMINISTRATION' AND p.service_level='CORE' AND p.is_current
ON CONFLICT DO NOTHING;