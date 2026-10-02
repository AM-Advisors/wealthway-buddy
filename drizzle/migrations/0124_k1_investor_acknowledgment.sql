-- K-1 investor delivery acknowledgment (additive).
ALTER TABLE public.k1_forms
  ADD COLUMN investor_acknowledged_at timestamptz,
  ADD COLUMN investor_acknowledged_by uuid;

COMMENT ON COLUMN public.k1_forms.investor_acknowledged_at IS 'Set when the investor confirms receipt of this K-1 on their fund page.';
COMMENT ON COLUMN public.k1_forms.investor_acknowledged_by IS 'Auth user id of the investor who acknowledged receipt.';