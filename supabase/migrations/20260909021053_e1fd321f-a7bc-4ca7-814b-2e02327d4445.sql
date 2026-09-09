ALTER TABLE public.investor_applications
  ADD COLUMN source text NOT NULL DEFAULT 'portal';

ALTER TABLE public.investor_applications
  ADD CONSTRAINT investor_applications_source_check
  CHECK (source IN ('portal', 'fund_page', 'referral', 'admin'));

CREATE INDEX investor_applications_offering_source_idx
  ON public.investor_applications (offering_id, source);