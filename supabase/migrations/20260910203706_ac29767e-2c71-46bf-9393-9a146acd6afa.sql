CREATE TABLE public.provider_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.third_party_providers(id) ON DELETE CASCADE,
  title text NOT NULL,
  reference text,
  scope_summary text,
  services text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'USD',
  start_date date,
  end_date date,
  notice_days integer NOT NULL DEFAULT 60,
  document_url text,
  provider_signer_name text,
  provider_signer_title text,
  provider_signed_at timestamptz,
  harmonious_signer_name text,
  harmonious_signer_title text,
  harmonious_signed_at timestamptz,
  activated_by uuid,
  activated_at timestamptz,
  terminated_at timestamptz,
  termination_reason text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.provider_agreement_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.provider_agreements(id) ON DELETE CASCADE,
  label text NOT NULL,
  description text,
  basis text NOT NULL DEFAULT 'per_fund',
  amount_cents bigint NOT NULL DEFAULT 0,
  minimum_cents bigint,
  cap_cents bigint,
  billed_to_client boolean NOT NULL DEFAULT true,
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.provider_agreement_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.provider_agreements(id) ON DELETE CASCADE,
  label text NOT NULL,
  detail text,
  required boolean NOT NULL DEFAULT true,
  met boolean NOT NULL DEFAULT false,
  evidence_url text,
  confirmed_by uuid,
  confirmed_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX provider_agreements_provider_idx ON public.provider_agreements (provider_id, status);
CREATE UNIQUE INDEX provider_agreements_one_active_idx
  ON public.provider_agreements (provider_id) WHERE status = 'active';
CREATE INDEX provider_agreement_rates_agreement_idx ON public.provider_agreement_rates (agreement_id);
CREATE INDEX provider_agreement_conditions_agreement_idx ON public.provider_agreement_conditions (agreement_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_agreements TO authenticated;
GRANT ALL ON public.provider_agreements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_agreement_rates TO authenticated;
GRANT ALL ON public.provider_agreement_rates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_agreement_conditions TO authenticated;
GRANT ALL ON public.provider_agreement_conditions TO service_role;

ALTER TABLE public.provider_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_agreement_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_agreement_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff and the provider can see provider agreements"
ON public.provider_agreements FOR SELECT TO authenticated
USING (
  private.is_staff(auth.uid())
  OR (status IN ('signed','active','expired','terminated') AND private.provider_member(auth.uid(), provider_id))
);

CREATE POLICY "Contract authority manages provider agreements"
ON public.provider_agreements FOR ALL TO authenticated
USING (private.can_manage_contracts(auth.uid()))
WITH CHECK (private.can_manage_contracts(auth.uid()));

CREATE POLICY "Staff and the provider can see agreement rates"
ON public.provider_agreement_rates FOR SELECT TO authenticated
USING (
  private.is_staff(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.provider_agreements a
    WHERE a.id = agreement_id
      AND a.status IN ('signed','active','expired','terminated')
      AND private.provider_member(auth.uid(), a.provider_id)
  )
);

CREATE POLICY "Contract authority manages agreement rates"
ON public.provider_agreement_rates FOR ALL TO authenticated
USING (private.can_manage_contracts(auth.uid()))
WITH CHECK (private.can_manage_contracts(auth.uid()));

CREATE POLICY "Staff and the provider can see agreement conditions"
ON public.provider_agreement_conditions FOR SELECT TO authenticated
USING (
  private.is_staff(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.provider_agreements a
    WHERE a.id = agreement_id
      AND a.status IN ('signed','active','expired','terminated')
      AND private.provider_member(auth.uid(), a.provider_id)
  )
);

CREATE POLICY "Contract authority manages agreement conditions"
ON public.provider_agreement_conditions FOR ALL TO authenticated
USING (private.can_manage_contracts(auth.uid()))
WITH CHECK (private.can_manage_contracts(auth.uid()));

CREATE TRIGGER provider_agreements_updated BEFORE UPDATE ON public.provider_agreements
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER provider_agreement_rates_updated BEFORE UPDATE ON public.provider_agreement_rates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER provider_agreement_conditions_updated BEFORE UPDATE ON public.provider_agreement_conditions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();