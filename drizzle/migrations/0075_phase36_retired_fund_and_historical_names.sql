CREATE TABLE public.fund_name_reuse_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_name text NOT NULL,
  historical_offering_id uuid NOT NULL REFERENCES public.offerings(id),
  reason text NOT NULL,
  approved_by uuid NOT NULL,
  consumed_by_offering_id uuid REFERENCES public.offerings(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_name_reuse_approvals TO service_role;
ALTER TABLE public.fund_name_reuse_approvals ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.fund_name_reuse_approvals IS 'Explicit Harmonious approval that a new Fund reusing a historical/retired Fund name is a genuinely different legal Fund. Service-role only.';

CREATE OR REPLACE FUNCTION public.guard_unique_fund_name()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  n text := public.normalize_fund_name(NEW.name);
  hit uuid;
BEGIN
  IF n IS NULL THEN
    RAISE EXCEPTION 'A Fund name is required.' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' AND n IS NOT DISTINCT FROM public.normalize_fund_name(OLD.name) THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('fund-name:' || n));
  SELECT id INTO hit FROM public.offerings
   WHERE public.normalize_fund_name(name) = n AND id <> NEW.id AND consolidated_into IS NULL LIMIT 1;
  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate_fund_name:%', hit USING ERRCODE = '23505';
  END IF;
  -- Historical identity: retired Funds and prior names of other Funds stay reserved.
  SELECT id INTO hit FROM public.offerings
   WHERE public.normalize_fund_name(name) = n AND id <> NEW.id AND consolidated_into IS NOT NULL LIMIT 1;
  IF hit IS NULL THEN
    SELECT offering_id INTO hit FROM public.offering_name_history
     WHERE offering_id <> NEW.id AND public.normalize_fund_name(previous_name) = n LIMIT 1;
  END IF;
  IF hit IS NOT NULL THEN
    UPDATE public.fund_name_reuse_approvals SET consumed_by_offering_id = NEW.id
     WHERE id = (SELECT id FROM public.fund_name_reuse_approvals
                  WHERE normalized_name = n AND historical_offering_id = hit AND consumed_by_offering_id IS NULL
                  ORDER BY created_at LIMIT 1)
    RETURNING historical_offering_id INTO hit;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'historical_fund_name:%', hit USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.block_new_link_on_consolidated_fund()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.offering_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.offerings WHERE id = NEW.offering_id AND consolidated_into IS NOT NULL) THEN
    RAISE EXCEPTION 'fund_consolidated: this Fund was consolidated and cannot receive new % records', TG_TABLE_NAME USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER fund_invitations_no_consolidated_fund BEFORE INSERT ON public.fund_invitations
  FOR EACH ROW EXECUTE FUNCTION public.block_new_link_on_consolidated_fund();
CREATE TRIGGER fund_onboarding_links_no_consolidated_fund BEFORE INSERT ON public.fund_onboarding_links
  FOR EACH ROW EXECUTE FUNCTION public.block_new_link_on_consolidated_fund();
CREATE TRIGGER investor_applications_no_consolidated_fund BEFORE INSERT ON public.investor_applications
  FOR EACH ROW EXECUTE FUNCTION public.block_new_link_on_consolidated_fund();
CREATE TRIGGER offering_documents_no_consolidated_fund BEFORE INSERT ON public.offering_documents
  FOR EACH ROW EXECUTE FUNCTION public.block_new_link_on_consolidated_fund();