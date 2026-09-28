CREATE TABLE public.investor_drive_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  investment_profile_id uuid NOT NULL REFERENCES public.investment_profiles(id),
  onboarding_id uuid NOT NULL,
  investor_user_id uuid NOT NULL,
  environment text NOT NULL DEFAULT 'production',
  drive_id text NOT NULL,
  folder_id text NOT NULL,
  folder_path text NOT NULL,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','disconnected')),
  connected_by uuid NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_by uuid,
  disconnected_at timestamptz,
  last_checked_at timestamptz,
  last_check jsonb
);
CREATE UNIQUE INDEX investor_drive_connections_one_active
  ON public.investor_drive_connections (offering_id, investment_profile_id) WHERE status = 'connected';
CREATE UNIQUE INDEX investor_drive_connections_folder_active
  ON public.investor_drive_connections (folder_id) WHERE status = 'connected';
GRANT ALL ON public.investor_drive_connections TO service_role;
ALTER TABLE public.investor_drive_connections ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.investor_drive_connections IS 'Read-only intake link from one Fund+Investment Profile to an existing folder in the Restricted Investor Records drive. Server-only; no client policies.';