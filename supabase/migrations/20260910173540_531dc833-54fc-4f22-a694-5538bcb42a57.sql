ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS wire_fee_source text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS wire_fee_rate_id uuid REFERENCES public.client_pricing(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wire_fee_reason text,
  ADD COLUMN IF NOT EXISTS closing_cost_source text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS closing_cost_rate_id uuid REFERENCES public.client_pricing(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closing_cost_reason text;

ALTER TABLE public.offerings
  ADD CONSTRAINT offerings_wire_fee_source_check CHECK (wire_fee_source IN ('client_rate','standard','custom')),
  ADD CONSTRAINT offerings_closing_cost_source_check CHECK (closing_cost_source IN ('client_rate','standard','custom'));

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS fee_source text,
  ADD COLUMN IF NOT EXISTS fee_rate_id uuid REFERENCES public.client_pricing(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fee_override_reason text;

ALTER TABLE public.service_requests
  ADD CONSTRAINT service_requests_fee_source_check CHECK (fee_source IS NULL OR fee_source IN ('client_rate','standard','custom'));