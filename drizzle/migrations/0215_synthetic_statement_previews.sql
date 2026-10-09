CREATE TABLE public.synthetic_statement_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  account_id uuid NOT NULL REFERENCES public.synthetic_capital_accounts(id),
  content_hash text NOT NULL,
  ending_capital_cents bigint NOT NULL,
  channel text NOT NULL CHECK (channel IN ('internal_preview','internal_pdf')),
  classification text NOT NULL DEFAULT 'DEMO / SYNTHETIC — UNAUDITED — NOT CONTRACTUAL — NOT FOR INVESTOR DISTRIBUTION'
    CHECK (classification = 'DEMO / SYNTHETIC — UNAUDITED — NOT CONTRACTUAL — NOT FOR INVESTOR DISTRIBUTION'),
  generated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, content_hash, channel)
);
GRANT ALL ON public.synthetic_statement_previews TO service_role;
ALTER TABLE public.synthetic_statement_previews ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.guard_synthetic_statement_preview()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Synthetic statement preview records are immutable.'; END IF;
  PERFORM public.assert_demo_offering(NEW.offering_id);
  IF NOT EXISTS (SELECT 1 FROM public.synthetic_capital_accounts a WHERE a.id = NEW.account_id AND a.offering_id = NEW.offering_id AND a.ending_capital_cents = NEW.ending_capital_cents) THEN
    RAISE EXCEPTION 'Preview must match its synthetic capital account and fund.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_synthetic_statement_preview BEFORE INSERT OR UPDATE OR DELETE ON public.synthetic_statement_previews FOR EACH ROW EXECUTE FUNCTION public.guard_synthetic_statement_preview();

CREATE OR REPLACE FUNCTION public.guard_production_statement_not_synthetic()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(NEW.snapshot::text, '') ILIKE '%SYNTHETIC%'
     OR EXISTS (SELECT 1 FROM public.synthetic_capital_accounts a WHERE a.offering_id = NEW.offering_id AND a.period_end = NEW.period_end) THEN
    RAISE EXCEPTION 'Synthetic capital data cannot be promoted into production investor statements.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_production_statement_not_synthetic BEFORE INSERT OR UPDATE ON public.capital_account_statements FOR EACH ROW EXECUTE FUNCTION public.guard_production_statement_not_synthetic();