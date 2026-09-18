-- Step 7: investor reporting center, reporting packages, notices, delivery.
-- Distribution layer only: every component references an already-approved or
-- published authoritative record. Nothing here recalculates accounting.

CREATE TABLE public.fund_reporting_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL UNIQUE REFERENCES public.offerings(id) ON DELETE CASCADE,
  portfolio_visibility TEXT NOT NULL DEFAULT 'none'
    CHECK (portfolio_visibility IN ('none','summary','detail')),
  portfolio_columns JSONB NOT NULL DEFAULT '["asset","security","cost","value","change","pct_nav","status"]'::jsonb,
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  administrator_attribution TEXT NOT NULL DEFAULT 'Administered by Harmonious',
  contact JSONB NOT NULL DEFAULT '{}'::jsonb,
  manager_review_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_reporting_policies TO authenticated;
GRANT ALL ON public.fund_reporting_policies TO service_role;
ALTER TABLE public.fund_reporting_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read reporting policies" ON public.fund_reporting_policies
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "managers read their reporting policy" ON public.fund_reporting_policies
  FOR SELECT TO authenticated USING (private.manages_offering(offering_id));

CREATE TABLE public.reporting_package_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  offering_id UUID REFERENCES public.offerings(id) ON DELETE CASCADE,
  fund_type TEXT,
  investor_class_id UUID,
  frequency TEXT NOT NULL DEFAULT 'quarter',
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_components JSONB NOT NULL DEFAULT '[]'::jsonb,
  portfolio_detail TEXT NOT NULL DEFAULT 'policy'
    CHECK (portfolio_detail IN ('policy','none','summary','detail')),
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rpt_templates_offering ON public.reporting_package_templates(offering_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reporting_package_templates TO authenticated;
GRANT ALL ON public.reporting_package_templates TO service_role;
ALTER TABLE public.reporting_package_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read package templates" ON public.reporting_package_templates
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "managers read their package templates" ON public.reporting_package_templates
  FOR SELECT TO authenticated
  USING (offering_id IS NOT NULL AND private.manages_offering(offering_id));

CREATE TABLE public.investor_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  investor_user_id UUID NOT NULL,
  investment_profile_id UUID,
  position_id UUID REFERENCES public.investor_positions(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.reporting_package_templates(id) ON DELETE SET NULL,
  template_code TEXT,
  template_version INTEGER,
  period_kind TEXT NOT NULL DEFAULT 'quarter',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','review','approved','published','superseded')),
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id UUID REFERENCES public.investor_packages(id) ON DELETE SET NULL,
  superseded_by_id UUID REFERENCES public.investor_packages(id) ON DELETE SET NULL,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  manager_response TEXT,
  manager_note TEXT,
  manager_responded_by UUID,
  manager_responded_at TIMESTAMPTZ,
  requires_acknowledgement BOOLEAN NOT NULL DEFAULT false,
  revision_reason TEXT,
  generated_by UUID,
  generated_at TIMESTAMPTZ,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  published_by UUID,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_investor_packages_offering ON public.investor_packages(offering_id, period_end);
CREATE INDEX idx_investor_packages_investor ON public.investor_packages(investor_user_id, status);
CREATE INDEX idx_investor_packages_profile ON public.investor_packages(investment_profile_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investor_packages TO authenticated;
GRANT ALL ON public.investor_packages TO service_role;
ALTER TABLE public.investor_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read investor packages" ON public.investor_packages
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "managers read published packages for their funds" ON public.investor_packages
  FOR SELECT TO authenticated
  USING (status IN ('published','superseded') AND private.manages_offering(offering_id));
CREATE POLICY "investors read their published packages" ON public.investor_packages
  FOR SELECT TO authenticated
  USING (investor_user_id = auth.uid() AND status IN ('published','superseded'));

CREATE TABLE public.investor_package_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.investor_packages(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  title TEXT NOT NULL,
  source_table TEXT,
  source_id UUID,
  source_version INTEGER,
  source_status TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_package_components_package ON public.investor_package_components(package_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investor_package_components TO authenticated;
GRANT ALL ON public.investor_package_components TO service_role;
ALTER TABLE public.investor_package_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read package components" ON public.investor_package_components
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "readers read components of packages they may read"
  ON public.investor_package_components
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.investor_packages p
    WHERE p.id = package_id
      AND p.status IN ('published','superseded')
      AND (p.investor_user_id = auth.uid() OR private.manages_offering(p.offering_id))
  ));

CREATE TABLE public.investor_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'capital_call','distribution','quarterly_report','annual_report','valuation',
    'amendment','tax','general'
  )),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  period_label TEXT,
  effective_date DATE,
  amount_cents BIGINT,
  due_date DATE,
  document_path TEXT,
  requires_acknowledgement BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','superseded')),
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id UUID REFERENCES public.investor_notices(id) ON DELETE SET NULL,
  superseded_by_id UUID REFERENCES public.investor_notices(id) ON DELETE SET NULL,
  created_by UUID,
  published_by UUID,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_investor_notices_offering ON public.investor_notices(offering_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investor_notices TO authenticated;
GRANT ALL ON public.investor_notices TO service_role;
ALTER TABLE public.investor_notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read notices" ON public.investor_notices
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "managers read notices for their funds" ON public.investor_notices
  FOR SELECT TO authenticated USING (private.manages_offering(offering_id));

CREATE TABLE public.investor_notice_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id UUID NOT NULL REFERENCES public.investor_notices(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  investor_user_id UUID NOT NULL,
  investment_profile_id UUID,
  position_id UUID REFERENCES public.investor_positions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notice_targets_notice ON public.investor_notice_targets(notice_id);
CREATE INDEX idx_notice_targets_investor ON public.investor_notice_targets(investor_user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investor_notice_targets TO authenticated;
GRANT ALL ON public.investor_notice_targets TO service_role;
ALTER TABLE public.investor_notice_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read notice targets" ON public.investor_notice_targets
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "investors read their published notice targets" ON public.investor_notice_targets
  FOR SELECT TO authenticated
  USING (investor_user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.investor_notices n
    WHERE n.id = notice_id AND n.status IN ('published','superseded')
  ));

CREATE TABLE public.reporting_delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID REFERENCES public.investor_packages(id) ON DELETE CASCADE,
  notice_id UUID REFERENCES public.investor_notices(id) ON DELETE CASCADE,
  offering_id UUID REFERENCES public.offerings(id) ON DELETE SET NULL,
  investor_user_id UUID,
  actor_user_id UUID,
  on_behalf_of BOOLEAN NOT NULL DEFAULT false,
  delegation_id UUID,
  event TEXT NOT NULL CHECK (event IN (
    'published','delivered','opened','downloaded','acknowledged','exported'
  )),
  channel TEXT NOT NULL DEFAULT 'portal',
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_delivery_events_package ON public.reporting_delivery_events(package_id);
CREATE INDEX idx_delivery_events_investor ON public.reporting_delivery_events(investor_user_id);
GRANT SELECT ON public.reporting_delivery_events TO authenticated;
GRANT ALL ON public.reporting_delivery_events TO service_role;
ALTER TABLE public.reporting_delivery_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read delivery events" ON public.reporting_delivery_events
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "investors read their own delivery events" ON public.reporting_delivery_events
  FOR SELECT TO authenticated USING (investor_user_id = auth.uid());

-- A published package is frozen. Only the supersede pointer, the manager's
-- response and the status move to 'superseded' may ever change afterwards.
CREATE OR REPLACE FUNCTION public.protect_published_investor_package()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published','superseded') THEN
      RAISE EXCEPTION 'A published reporting package cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('published','superseded') THEN
    IF NEW.offering_id IS DISTINCT FROM OLD.offering_id
      OR NEW.investor_user_id IS DISTINCT FROM OLD.investor_user_id
      OR NEW.investment_profile_id IS DISTINCT FROM OLD.investment_profile_id
      OR NEW.position_id IS DISTINCT FROM OLD.position_id
      OR NEW.period_start IS DISTINCT FROM OLD.period_start
      OR NEW.period_end IS DISTINCT FROM OLD.period_end
      OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.sections::text IS DISTINCT FROM OLD.sections::text
      OR NEW.manifest::text IS DISTINCT FROM OLD.manifest::text
      OR NEW.template_id IS DISTINCT FROM OLD.template_id
      OR NEW.template_version IS DISTINCT FROM OLD.template_version
      OR NEW.published_by IS DISTINCT FROM OLD.published_by
      OR NEW.published_at IS DISTINCT FROM OLD.published_at
    THEN
      RAISE EXCEPTION 'A published reporting package is corrected by a superseding version, never rewritten.';
    END IF;
    IF OLD.status = 'superseded' AND NEW.status <> 'superseded' THEN
      RAISE EXCEPTION 'A superseded reporting package cannot be reopened.';
    END IF;
    IF OLD.status = 'published' AND NEW.status NOT IN ('published','superseded') THEN
      RAISE EXCEPTION 'A published reporting package cannot be returned to an earlier state.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_protect_published_investor_package
  BEFORE UPDATE OR DELETE ON public.investor_packages
  FOR EACH ROW EXECUTE FUNCTION public.protect_published_investor_package();

-- Components of a published package are the frozen evidence of what was sent.
CREATE OR REPLACE FUNCTION public.protect_published_package_components()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_status TEXT;
BEGIN
  SELECT status INTO parent_status FROM public.investor_packages
   WHERE id = COALESCE(NEW.package_id, OLD.package_id);
  IF parent_status IN ('published','superseded') THEN
    RAISE EXCEPTION 'The contents of a published reporting package cannot be changed.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER trg_protect_published_package_components
  BEFORE UPDATE OR DELETE ON public.investor_package_components
  FOR EACH ROW EXECUTE FUNCTION public.protect_published_package_components();

-- Delivery history is evidence: append only.
CREATE OR REPLACE FUNCTION public.protect_delivery_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Reporting delivery history is append-only.';
END;
$$;
CREATE TRIGGER trg_protect_delivery_events
  BEFORE UPDATE OR DELETE ON public.reporting_delivery_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_delivery_events();

-- A published notice is amended by a superseding notice.
CREATE OR REPLACE FUNCTION public.protect_published_notice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published','superseded') THEN
      RAISE EXCEPTION 'A published investor notice cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('published','superseded') THEN
    IF NEW.title IS DISTINCT FROM OLD.title
      OR NEW.body IS DISTINCT FROM OLD.body
      OR NEW.kind IS DISTINCT FROM OLD.kind
      OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
      OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
      OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.published_at IS DISTINCT FROM OLD.published_at
    THEN
      RAISE EXCEPTION 'A published investor notice is amended by a superseding notice.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_protect_published_notice
  BEFORE UPDATE OR DELETE ON public.investor_notices
  FOR EACH ROW EXECUTE FUNCTION public.protect_published_notice();