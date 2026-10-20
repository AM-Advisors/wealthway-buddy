ALTER TABLE public.sales_quote_lines
  ADD COLUMN IF NOT EXISTS billing_frequency text NOT NULL DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS first_bill_on date;
ALTER TABLE public.sales_quote_lines DROP CONSTRAINT IF EXISTS sales_quote_lines_billing_frequency_chk;
ALTER TABLE public.sales_quote_lines ADD CONSTRAINT sales_quote_lines_billing_frequency_chk CHECK (billing_frequency IN ('one_time','monthly','quarterly','annual'));

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS generated_by_schedule boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS issue_self_reason text,
  ADD COLUMN IF NOT EXISTS card_session_id text;

CREATE TABLE public.invoice_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sow_id uuid NOT NULL REFERENCES public.client_sows(id),
  client_id uuid NOT NULL,
  line_index integer NOT NULL,
  service_key text,
  label text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  frequency text NOT NULL CHECK (frequency IN ('one_time','monthly','quarterly','annual')),
  next_due_on date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sow_id, line_index)
);
GRANT ALL ON public.invoice_schedules TO service_role;
ALTER TABLE public.invoice_schedules ENABLE ROW LEVEL SECURITY;

-- One invoice line per schedule period, so a re-run can never bill twice.
CREATE UNIQUE INDEX IF NOT EXISTS invoice_lines_schedule_period_uniq
  ON public.invoice_lines (source_ref) WHERE source = 'schedule';

CREATE TABLE public.commission_payout_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  invoice_line_id uuid NOT NULL,
  quote_id uuid,
  user_id uuid,
  layer text NOT NULL,
  amount_cents bigint NOT NULL,
  due_on date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','cancelled')),
  reason text,
  payout_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS commission_payout_queue_uniq
  ON public.commission_payout_queue (invoice_line_id, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), layer);
GRANT ALL ON public.commission_payout_queue TO service_role;
ALTER TABLE public.commission_payout_queue ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.guard_payout_queue()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Queued payouts are never deleted.'; END IF;
  IF OLD.status <> 'scheduled' THEN RAISE EXCEPTION 'A confirmed or cancelled payout can''t change.'; END IF;
  IF NEW.amount_cents <> OLD.amount_cents OR NEW.invoice_line_id <> OLD.invoice_line_id OR NEW.layer <> OLD.layer
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Queued payout amounts and recipients are fixed.';
  END IF;
  IF NEW.status = 'cancelled' AND COALESCE(trim(NEW.reason), '') = '' THEN RAISE EXCEPTION 'A cancellation needs a reason.'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER guard_payout_queue BEFORE UPDATE OR DELETE ON public.commission_payout_queue
  FOR EACH ROW EXECUTE FUNCTION public.guard_payout_queue();

CREATE TABLE public.commission_payout_queue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.commission_payout_queue(id),
  event_kind text NOT NULL,
  actor_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.commission_payout_queue_events TO service_role;
ALTER TABLE public.commission_payout_queue_events ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_payout_queue_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Payout history is permanent.'; END $$;
CREATE TRIGGER block_payout_queue_event_mutation BEFORE UPDATE OR DELETE ON public.commission_payout_queue_events
  FOR EACH ROW EXECUTE FUNCTION public.block_payout_queue_event_mutation();