ALTER TYPE public.reg_type ADD VALUE IF NOT EXISTS 'regcf';
ALTER TYPE public.reg_type ADD VALUE IF NOT EXISTS 'rega';
ALTER TYPE public.reg_type ADD VALUE IF NOT EXISTS 'regaplus';

CREATE TABLE public.fund_compliance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  key text,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'Other',
  status text NOT NULL DEFAULT 'not_started',
  due_date date,
  filed_on date,
  owner_name text,
  reference text,
  note text,
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fund_compliance_items_status_check CHECK (status IN ('not_started','in_progress','filed','not_applicable'))
);

CREATE UNIQUE INDEX fund_compliance_items_offering_key_idx
  ON public.fund_compliance_items (offering_id, key) WHERE key IS NOT NULL;
CREATE INDEX fund_compliance_items_offering_idx ON public.fund_compliance_items (offering_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_compliance_items TO authenticated;
GRANT ALL ON public.fund_compliance_items TO service_role;

ALTER TABLE public.fund_compliance_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fund team reads compliance items"
ON public.fund_compliance_items FOR SELECT TO authenticated
USING (public.can_manage_diligence(offering_id));

CREATE POLICY "Fund team inserts compliance items"
ON public.fund_compliance_items FOR INSERT TO authenticated
WITH CHECK (public.can_manage_diligence(offering_id));

CREATE POLICY "Fund team updates compliance items"
ON public.fund_compliance_items FOR UPDATE TO authenticated
USING (public.can_manage_diligence(offering_id))
WITH CHECK (public.can_manage_diligence(offering_id));

CREATE POLICY "Fund team deletes compliance items"
ON public.fund_compliance_items FOR DELETE TO authenticated
USING (public.can_manage_diligence(offering_id));

CREATE TRIGGER set_fund_compliance_items_updated_at
BEFORE UPDATE ON public.fund_compliance_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();