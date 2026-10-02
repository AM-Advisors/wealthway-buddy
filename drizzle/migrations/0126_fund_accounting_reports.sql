CREATE TABLE public.fund_report_settings (
  offering_id uuid PRIMARY KEY REFERENCES public.offerings(id) ON DELETE CASCADE,
  frequency text NOT NULL DEFAULT 'quarterly' CHECK (frequency IN ('monthly','quarterly')),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_report_settings TO service_role;
ALTER TABLE public.fund_report_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.fund_report_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('nav','financial_review')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','returned')),
  payment_id uuid,
  submitted_by uuid NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fund_report_drafts_offering_idx ON public.fund_report_drafts(offering_id, period_end DESC);
GRANT ALL ON public.fund_report_drafts TO service_role;
ALTER TABLE public.fund_report_drafts ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.fund_report_drafts IS 'Client-entered figures and the platform-built NAV / financial review draft; final only after Harmonious approval. Server functions only.';