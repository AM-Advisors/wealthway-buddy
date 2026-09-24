CREATE OR REPLACE FUNCTION public.set_staff_role(_user_id uuid, _role app_role, _grant boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'admin'::public.app_role)
       OR private.has_role(auth.uid(), 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Only an administrator can change Harmonious team access.';
  END IF;
  IF NOT private.grantable_staff_role(_role) THEN
    RAISE EXCEPTION 'That role cannot be granted from the console.';
  END IF;
  IF _role = 'tax'::public.app_role AND NOT private.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only a super administrator can grant or remove tax access.';
  END IF;
  IF _user_id = auth.uid() AND _role = 'admin'::public.app_role AND NOT _grant THEN
    RAISE EXCEPTION 'You cannot remove your own administrator access.';
  END IF;
  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role) ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
  END IF;
  INSERT INTO public.contract_audit_events (actor_id, actor_role, area, action, target, new_value)
  VALUES (auth.uid(), 'staff', 'team access', CASE WHEN _grant THEN 'granted' ELSE 'removed' END,
          _role::text, jsonb_build_object('user_id', _user_id, 'role', _role::text));
END;
$function$;

CREATE TABLE public.compliance_policy_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('high_risk_jurisdiction','edd_amount_threshold')),
  country_code text,
  risk_classification text,
  threshold_cents bigint,
  currency text,
  scope text NOT NULL DEFAULT 'global' CHECK (scope IN ('global','fund')),
  offering_id uuid REFERENCES public.offerings(id) ON DELETE CASCADE,
  effective_date date NOT NULL,
  source_reference text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired','superseded')),
  created_by uuid NOT NULL,
  reviewed_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  superseded_by uuid REFERENCES public.compliance_policy_entries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'high_risk_jurisdiction' OR (country_code IS NOT NULL AND risk_classification IS NOT NULL)),
  CHECK (kind <> 'edd_amount_threshold' OR (threshold_cents IS NOT NULL AND threshold_cents > 0 AND currency IS NOT NULL)),
  CHECK (scope <> 'fund' OR offering_id IS NOT NULL),
  CHECK (approved_by IS NULL OR approved_by <> created_by)
);
GRANT SELECT ON public.compliance_policy_entries TO authenticated;
GRANT ALL ON public.compliance_policy_entries TO service_role;
ALTER TABLE public.compliance_policy_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read compliance policy" ON public.compliance_policy_entries FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE TABLE public.legal_wording_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_key text NOT NULL,
  title text NOT NULL,
  wording text NOT NULL,
  version integer NOT NULL,
  effective_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  created_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requirement_key, version),
  CHECK (approved_by IS NULL OR approved_by <> created_by)
);
GRANT SELECT ON public.legal_wording_versions TO authenticated;
GRANT ALL ON public.legal_wording_versions TO service_role;
ALTER TABLE public.legal_wording_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read wording" ON public.legal_wording_versions FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "Signed-in users read approved wording" ON public.legal_wording_versions FOR SELECT TO authenticated USING (status = 'approved');

CREATE OR REPLACE FUNCTION public.protect_approved_wording() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'Approved or retired wording cannot be deleted.'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' AND (NEW.wording IS DISTINCT FROM OLD.wording OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.version IS DISTINCT FROM OLD.version OR NEW.requirement_key IS DISTINCT FROM OLD.requirement_key) THEN
    RAISE EXCEPTION 'Approved wording is permanent. Create a new version instead.';
  END IF;
  IF OLD.status = 'retired' AND NEW.status <> 'retired' THEN RAISE EXCEPTION 'Retired wording cannot be re-approved.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_approved_wording BEFORE UPDATE OR DELETE ON public.legal_wording_versions FOR EACH ROW EXECUTE FUNCTION public.protect_approved_wording();

CREATE OR REPLACE FUNCTION public.protect_approved_policy() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'Approved policy entries cannot be deleted.'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' AND (NEW.country_code IS DISTINCT FROM OLD.country_code OR NEW.threshold_cents IS DISTINCT FROM OLD.threshold_cents
     OR NEW.risk_classification IS DISTINCT FROM OLD.risk_classification OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
     OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW.offering_id IS DISTINCT FROM OLD.offering_id) THEN
    RAISE EXCEPTION 'Approved policy entries are permanent. Supersede with a new entry.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_approved_policy BEFORE UPDATE OR DELETE ON public.compliance_policy_entries FOR EACH ROW EXECUTE FUNCTION public.protect_approved_policy();

ALTER TABLE public.investor_certifications ADD COLUMN IF NOT EXISTS wording_version_id uuid REFERENCES public.legal_wording_versions(id);
ALTER TABLE public.compliance_questionnaire_responses ADD COLUMN IF NOT EXISTS wording_version_id uuid REFERENCES public.legal_wording_versions(id);