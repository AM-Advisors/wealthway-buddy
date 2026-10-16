CREATE TABLE public.client_service_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  offering_id uuid,
  service_key text NOT NULL,
  label text NOT NULL,
  cadence text NOT NULL DEFAULT 'annual' CHECK (cadence IN ('annual','quarterly','one_time')),
  amount_cents bigint NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  start_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','active','ended')),
  card_autopay boolean NOT NULL DEFAULT false,
  reminders_paused boolean NOT NULL DEFAULT false,
  proposed_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  approval_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.client_service_records (client_id);
GRANT ALL ON public.client_service_records TO service_role;
ALTER TABLE public.client_service_records ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.client_menu_switch_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  decided_by uuid,
  decided_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.client_menu_switch_requests TO service_role;
ALTER TABLE public.client_menu_switch_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.migration_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  paid_on date NOT NULL,
  method text NOT NULL CHECK (method IN ('wire','ach','card','check','other')),
  period_start date,
  period_end date,
  included_service_keys text[] NOT NULL DEFAULT '{}',
  proof_path text,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
  recorded_by uuid NOT NULL,
  confirmed_by uuid,
  confirmed_at timestamptz,
  confirm_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.migration_payments (offering_id);
GRANT ALL ON public.migration_payments TO service_role;
ALTER TABLE public.migration_payments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.billing_record_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_kind text NOT NULL,
  entity_id uuid NOT NULL,
  client_id uuid,
  actor_id uuid,
  event_kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.billing_record_events (client_id, created_at DESC);
GRANT ALL ON public.billing_record_events TO service_role;
ALTER TABLE public.billing_record_events ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_billing_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'billing history is append-only'; END $$;
CREATE TRIGGER billing_record_events_append_only BEFORE UPDATE OR DELETE ON public.billing_record_events
  FOR EACH ROW EXECUTE FUNCTION public.block_billing_event_mutation();

CREATE TABLE public.payment_reminder_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.client_service_records(id) ON DELETE CASCADE,
  due_on date NOT NULL,
  stage_key text NOT NULL,
  manual boolean NOT NULL DEFAULT false,
  sent_by uuid,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_id, due_on, stage_key)
);
GRANT ALL ON public.payment_reminder_sends TO service_role;
ALTER TABLE public.payment_reminder_sends ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.staff_nav_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_url text NOT NULL,
  item_title text NOT NULL,
  granted_by uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid
);
CREATE INDEX ON public.staff_nav_grants (user_id) WHERE revoked_at IS NULL;
GRANT ALL ON public.staff_nav_grants TO service_role;
ALTER TABLE public.staff_nav_grants ENABLE ROW LEVEL SECURITY;