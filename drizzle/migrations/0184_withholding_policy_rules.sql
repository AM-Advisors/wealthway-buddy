CREATE TABLE public.tax_withholding_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE CASCADE,
  investor_tax_status text NOT NULL DEFAULT 'any',
  distribution_character text NOT NULL DEFAULT 'any',
  withholding_type text NOT NULL DEFAULT 'other',
  rate_bps integer NOT NULL DEFAULT 0 CHECK (rate_bps >= 0 AND rate_bps <= 10000),
  jurisdiction text,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  documentation_required boolean NOT NULL DEFAULT true,
  manual_review_required boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  policy_source text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tax_withholding_rules TO service_role;
ALTER TABLE public.tax_withholding_rules ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.tax_withholding_rules IS 'Adviser-approved withholding policy. Service-role only; no matching approved rule means Withholding Review Required.';

ALTER TABLE public.distribution_lines
  ADD COLUMN IF NOT EXISTS withholding_status text NOT NULL DEFAULT 'determined',
  ADD COLUMN IF NOT EXISTS withholding_policy jsonb,
  ADD COLUMN IF NOT EXISTS withholding_suggested_cents bigint,
  ADD COLUMN IF NOT EXISTS withholding_decided_by uuid,
  ADD COLUMN IF NOT EXISTS withholding_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS withholding_decision_reason text;
COMMENT ON COLUMN public.distribution_lines.withholding_status IS 'determined (approved rule) | review_required | reviewer_set';