ALTER TABLE public.client_branding
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS billing_environment text,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_status text;

CREATE OR REPLACE FUNCTION public.enforce_cap_stakeholder_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t text; lim int; n int;
BEGIN
  SELECT tier INTO t FROM public.cap_table_subscriptions
   WHERE company_id = NEW.company_id ORDER BY created_at DESC LIMIT 1;
  IF t IS NULL THEN RETURN NEW; END IF;
  lim := CASE t WHEN 'free' THEN 5 WHEN 'starter' THEN 25 WHEN 'growth' THEN 50 ELSE NULL END;
  IF lim IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO n FROM public.ct_stakeholders WHERE company_id = NEW.company_id;
  IF n >= lim THEN
    RAISE EXCEPTION 'PLAN_LIMIT: Your % plan allows up to % stakeholders. Upgrade your plan to add more.', initcap(t), lim;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cap_stakeholder_limit ON public.ct_stakeholders;
CREATE TRIGGER trg_cap_stakeholder_limit BEFORE INSERT ON public.ct_stakeholders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cap_stakeholder_limit();