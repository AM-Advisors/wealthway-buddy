ALTER TABLE public.ct_transactions
  ADD COLUMN IF NOT EXISTS posting_status text NOT NULL DEFAULT 'posted',
  ADD COLUMN IF NOT EXISTS reverses_transaction_id uuid REFERENCES public.ct_transactions(id),
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_by uuid;
ALTER TABLE public.ct_transactions ADD CONSTRAINT ct_transactions_posting_status_chk
  CHECK (posting_status IN ('draft','review','posted'));

CREATE OR REPLACE FUNCTION public.protect_posted_ct_transaction()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.posting_status = 'posted' THEN
      RAISE EXCEPTION 'Posted cap-table transactions cannot be deleted; record a reversal instead';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.posting_status = 'posted' AND (
       NEW.posting_status IS DISTINCT FROM OLD.posting_status
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
    OR NEW.stakeholder_id IS DISTINCT FROM OLD.stakeholder_id
    OR NEW.counterparty_stakeholder_id IS DISTINCT FROM OLD.counterparty_stakeholder_id
    OR NEW.security_id IS DISTINCT FROM OLD.security_id
    OR NEW.company_id IS DISTINCT FROM OLD.company_id) THEN
    RAISE EXCEPTION 'Posted cap-table transactions cannot be edited; record a reversal instead';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_posted_ct_transaction ON public.ct_transactions;
CREATE TRIGGER trg_protect_posted_ct_transaction BEFORE UPDATE OR DELETE ON public.ct_transactions
  FOR EACH ROW EXECUTE FUNCTION public.protect_posted_ct_transaction();

ALTER TABLE public.ct_documents
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS stakeholder_id uuid,
  ADD COLUMN IF NOT EXISTS security_id uuid,
  ADD COLUMN IF NOT EXISTS transaction_id uuid,
  ADD COLUMN IF NOT EXISTS round_id uuid;

CREATE OR REPLACE FUNCTION public.can_prepare_investor(_offering_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_any_staff() OR EXISTS (
    SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = _offering_id AND fm.user_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.can_prepare_investor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_prepare_investor(uuid) TO authenticated;

CREATE TABLE public.investor_prep_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  created_by uuid NOT NULL,
  preparer_capacity text NOT NULL CHECK (preparer_capacity IN ('fund_manager','harmonious')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','cancelled')),
  email text NOT NULL,
  display_name text,
  profile_type text NOT NULL DEFAULT 'unknown',
  commitment_cents bigint,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  related_people jsonb NOT NULL DEFAULT '[]'::jsonb,
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  invitation_id uuid,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.investor_prep_drafts TO authenticated;
GRANT ALL ON public.investor_prep_drafts TO service_role;
ALTER TABLE public.investor_prep_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Preparers read drafts for their fund" ON public.investor_prep_drafts
  FOR SELECT TO authenticated USING (public.can_prepare_investor(offering_id));
CREATE POLICY "Preparers create drafts for their fund" ON public.investor_prep_drafts
  FOR INSERT TO authenticated WITH CHECK (public.can_prepare_investor(offering_id) AND created_by = auth.uid());
CREATE POLICY "Preparers edit unsent drafts" ON public.investor_prep_drafts
  FOR UPDATE TO authenticated USING (public.can_prepare_investor(offering_id) AND status = 'draft');

CREATE TABLE public.investor_prep_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.investor_prep_drafts(id),
  actor_id uuid NOT NULL,
  actor_capacity text NOT NULL,
  action text NOT NULL,
  field_key text,
  before_value jsonb,
  after_value jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.investor_prep_events TO authenticated;
GRANT ALL ON public.investor_prep_events TO service_role;
ALTER TABLE public.investor_prep_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Preparers read draft history" ON public.investor_prep_events
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.investor_prep_drafts d
    WHERE d.id = draft_id AND public.can_prepare_investor(d.offering_id)));
CREATE POLICY "Preparers append draft history" ON public.investor_prep_events
  FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid() AND EXISTS (SELECT 1 FROM public.investor_prep_drafts d
    WHERE d.id = draft_id AND public.can_prepare_investor(d.offering_id)));
CREATE OR REPLACE FUNCTION public.block_prep_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Preparation history is append-only'; END $$;
CREATE TRIGGER trg_block_prep_event_mutation BEFORE UPDATE OR DELETE ON public.investor_prep_events
  FOR EACH ROW EXECUTE FUNCTION public.block_prep_event_mutation();