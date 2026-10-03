CREATE TABLE public.account_identity_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  person_id uuid,
  provider text NOT NULL DEFAULT 'didit',
  session_id text,
  session_url text,
  vendor_data text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','pending','review','approved','declined','expired','sent_back')),
  decision_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_identity_checks_user_idx ON public.account_identity_checks(user_id, created_at DESC);
CREATE INDEX account_identity_checks_session_idx ON public.account_identity_checks(session_id);
GRANT ALL ON public.account_identity_checks TO service_role;
ALTER TABLE public.account_identity_checks ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.account_identity_checks IS 'Account-level identity verification gating portal access for non-staff; server-only via account-kyc.server.ts.';

CREATE TABLE public.account_identity_check_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id uuid NOT NULL REFERENCES public.account_identity_checks(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  event text NOT NULL,
  from_status text,
  to_status text,
  note text,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_identity_check_events_check_idx ON public.account_identity_check_events(check_id);
GRANT ALL ON public.account_identity_check_events TO service_role;
ALTER TABLE public.account_identity_check_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_account_identity_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'account_identity_check_events is append-only';
END $$;
CREATE TRIGGER account_identity_check_events_append_only
BEFORE UPDATE OR DELETE ON public.account_identity_check_events
FOR EACH ROW EXECUTE FUNCTION public.block_account_identity_event_mutation();