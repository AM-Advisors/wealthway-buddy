ALTER TABLE public.portfolio_valuations
  ADD COLUMN IF NOT EXISTS evidence_status text NOT NULL DEFAULT 'evidence_required',
  ADD COLUMN IF NOT EXISTS evidence_waiver_reason text,
  ADD COLUMN IF NOT EXISTS evidence_waived_by uuid,
  ADD COLUMN IF NOT EXISTS evidence_waived_at timestamptz;
COMMENT ON COLUMN public.portfolio_valuations.evidence_status IS 'evidence_required | evidence_provided | evidence_waived | evidence_not_required; the single evidence verdict used by submit, approve and exception checks';