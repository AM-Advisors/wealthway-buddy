CREATE TABLE public.report_card_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.report_card_versions(id),
  token_hash text NOT NULL UNIQUE,
  label text,
  created_by uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.report_card_share_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.report_card_share_links(id),
  outcome text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.compliance_report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  report_type text NOT NULL CHECK (report_type IN ('compliance_items_due','open_holds','combined')),
  frequency text NOT NULL CHECK (frequency IN ('weekly','monthly','quarterly')),
  recipients text[] NOT NULL DEFAULT '{}',
  next_run_on date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.compliance_report_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.compliance_report_schedules(id),
  period_on date NOT NULL,
  snapshot jsonb NOT NULL,
  recipients text[] NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_approval' CHECK (status IN ('awaiting_approval','approved','sent','rejected','failed')),
  prepared_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, period_on)
);
GRANT ALL ON public.report_card_share_links, public.report_card_share_views, public.compliance_report_schedules, public.compliance_report_deliveries TO service_role;
ALTER TABLE public.report_card_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_card_share_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_report_deliveries ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_share_view_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Share view history is permanent'; END $$;
CREATE TRIGGER report_card_share_views_immutable BEFORE UPDATE OR DELETE ON public.report_card_share_views
FOR EACH ROW EXECUTE FUNCTION public.block_share_view_mutation();

CREATE OR REPLACE FUNCTION public.guard_share_link_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Share links are kept; revoke instead'; END IF;
  IF OLD.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'A revoked link cannot change'; END IF;
  IF NEW.card_id <> OLD.card_id OR NEW.token_hash <> OLD.token_hash OR NEW.expires_at <> OLD.expires_at OR NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'Only revocation may change a share link'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER report_card_share_links_guard BEFORE UPDATE OR DELETE ON public.report_card_share_links
FOR EACH ROW EXECUTE FUNCTION public.guard_share_link_update();

CREATE OR REPLACE FUNCTION public.guard_compliance_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Delivery history is permanent'; END IF;
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.recipients IS DISTINCT FROM OLD.recipients OR NEW.period_on <> OLD.period_on THEN
    RAISE EXCEPTION 'A prepared report cannot be edited'; END IF;
  IF OLD.status IN ('sent','rejected') THEN RAISE EXCEPTION 'This delivery is final'; END IF;
  IF NEW.status IN ('approved','rejected') AND OLD.status = 'awaiting_approval' AND NEW.decided_by IS NOT DISTINCT FROM OLD.prepared_by THEN
    RAISE EXCEPTION 'A different person must approve this report'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER compliance_report_deliveries_guard BEFORE UPDATE OR DELETE ON public.compliance_report_deliveries
FOR EACH ROW EXECUTE FUNCTION public.guard_compliance_delivery();