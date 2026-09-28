CREATE TABLE public.access_account_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  classification text NOT NULL CHECK (classification IN ('individual','shared_inbox','service_account','integration_account')),
  reason text NOT NULL,
  recorded_by uuid,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.access_account_classifications TO service_role;
ALTER TABLE public.access_account_classifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX access_account_classifications_user_idx ON public.access_account_classifications (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.block_account_classification_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Account classifications are append-only; record a new classification instead.';
END $$;
CREATE TRIGGER access_account_classifications_immutable
BEFORE UPDATE OR DELETE ON public.access_account_classifications
FOR EACH ROW EXECUTE FUNCTION public.block_account_classification_mutation();

CREATE OR REPLACE FUNCTION public.current_account_classification(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT classification FROM public.access_account_classifications
  WHERE user_id = _user_id ORDER BY created_at DESC, id DESC LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.current_account_classification(uuid) FROM PUBLIC, anon, authenticated;

-- Privileged Harmonious roles require an explicitly classified individual human account.
CREATE OR REPLACE FUNCTION public.require_individual_for_privileged_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text;
BEGIN
  IF TG_TABLE_NAME = 'user_roles' THEN
    IF NEW.role::text NOT IN ('super_admin','admin') THEN RETURN NEW; END IF;
  ELSE
    IF NEW.role_key NOT IN ('super_admin','super_administrator','admin','operations_administrator','access_administrator','staff_administrator') OR NEW.scope_type <> 'global' THEN RETURN NEW; END IF;
  END IF;
  k := public.current_account_classification(NEW.user_id);
  IF k IS DISTINCT FROM 'individual' THEN
    RAISE EXCEPTION 'Privileged Harmonious roles require an account explicitly classified as Individual (current: %).', coalesce(k, 'unclassified');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER user_roles_privileged_requires_individual
BEFORE INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.require_individual_for_privileged_role();
CREATE TRIGGER access_role_assignments_privileged_requires_individual
BEFORE INSERT ON public.access_role_assignments
FOR EACH ROW EXECUTE FUNCTION public.require_individual_for_privileged_role();

ALTER TABLE public.compliance_access_review_decisions ADD COLUMN target text;
COMMENT ON COLUMN public.compliance_access_review_decisions.target IS 'Specific role or permission the decision applies to within a per-person review subject.';