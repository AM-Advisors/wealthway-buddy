CREATE TABLE public.service_sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_product text,
  service_level text,
  request_type text,
  is_global_fallback boolean NOT NULL DEFAULT false,
  initial_response_hours numeric,
  resolution_target_hours numeric,
  warning_threshold_percentage integer NOT NULL DEFAULT 75 CHECK (warning_threshold_percentage BETWEEN 1 AND 100),
  use_contract_sla boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CHECK (is_global_fallback OR (service_product IS NOT NULL AND service_level IS NOT NULL))
);
GRANT ALL ON public.service_sla_policies TO service_role;
ALTER TABLE public.service_sla_policies ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.service_engagements ADD COLUMN IF NOT EXISTS sla_initial_response_hours numeric;
ALTER TABLE public.service_engagements ADD COLUMN IF NOT EXISTS sla_resolution_target_hours numeric;
ALTER TABLE public.fund_service_requests ADD COLUMN IF NOT EXISTS sla_source text;
ALTER TABLE public.fund_service_requests ADD COLUMN IF NOT EXISTS sla_policy_id uuid REFERENCES public.service_sla_policies(id);

CREATE TABLE public.spv_transaction_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_name text NOT NULL,
  min_raise_usd numeric NOT NULL,
  max_raise_usd numeric,
  fee_usd numeric,
  label text NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
COMMENT ON COLUMN public.spv_transaction_pricing.fee_usd IS 'One-time SPV transaction administration fee; NULL = custom pricing. Separate from service-level recurring pricing.';
GRANT SELECT ON public.spv_transaction_pricing TO anon, authenticated;
GRANT ALL ON public.spv_transaction_pricing TO service_role;
ALTER TABLE public.spv_transaction_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Current SPV transaction pricing is public" ON public.spv_transaction_pricing FOR SELECT TO anon, authenticated USING (is_current);