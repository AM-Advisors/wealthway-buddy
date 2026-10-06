ALTER TABLE public.client_sows ADD COLUMN IF NOT EXISTS legacy_activation boolean NOT NULL DEFAULT false;
UPDATE public.client_sows SET legacy_activation = true WHERE status = 'active' AND executed_at IS NULL;
COMMENT ON COLUMN public.client_sows.legacy_activation IS 'Active before two-party signing was required; kept active by user decision.';