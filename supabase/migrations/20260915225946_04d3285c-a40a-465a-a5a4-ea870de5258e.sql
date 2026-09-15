
-- Grant acceptance on securities
ALTER TABLE public.ct_securities
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid,
  ADD COLUMN IF NOT EXISTS acceptance_name text;

-- Who is a holder (matched by account or invited email)
CREATE OR REPLACE FUNCTION public.ct_is_holder(_stakeholder_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ct_stakeholders s
    WHERE s.id = _stakeholder_id
      AND auth.uid() IS NOT NULL
      AND (
        s.user_id = auth.uid()
        OR lower(coalesce(s.email, '')) = lower(coalesce((auth.jwt() ->> 'email'), '~none~'))
      )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.ct_is_holder(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.ct_is_holder(uuid) TO authenticated, service_role;

-- Holder permissions
CREATE TABLE IF NOT EXISTS public.ct_holder_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  stakeholder_id uuid NOT NULL REFERENCES public.ct_stakeholders(id) ON DELETE CASCADE,
  can_view_holdings boolean NOT NULL DEFAULT true,
  can_view_vesting boolean NOT NULL DEFAULT true,
  can_view_documents boolean NOT NULL DEFAULT true,
  can_view_transactions boolean NOT NULL DEFAULT true,
  can_view_company_summary boolean NOT NULL DEFAULT false,
  can_view_valuations boolean NOT NULL DEFAULT false,
  can_view_tax_documents boolean NOT NULL DEFAULT false,
  can_request_exercise boolean NOT NULL DEFAULT true,
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stakeholder_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_holder_permissions TO authenticated;
GRANT ALL ON public.ct_holder_permissions TO service_role;
ALTER TABLE public.ct_holder_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins manage holder permissions"
  ON public.ct_holder_permissions FOR ALL TO authenticated
  USING (public.ct_can_manage(company_id))
  WITH CHECK (public.ct_can_manage(company_id));

CREATE POLICY "Holders read their own permissions"
  ON public.ct_holder_permissions FOR SELECT TO authenticated
  USING (public.ct_is_holder(stakeholder_id) OR public.ct_can_view(company_id));

CREATE TRIGGER ct_holder_permissions_updated_at
  BEFORE UPDATE ON public.ct_holder_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Exercise requests
CREATE TABLE IF NOT EXISTS public.ct_exercise_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ct_companies(id) ON DELETE CASCADE,
  security_id uuid NOT NULL REFERENCES public.ct_securities(id) ON DELETE CASCADE,
  stakeholder_id uuid NOT NULL REFERENCES public.ct_stakeholders(id) ON DELETE CASCADE,
  quantity numeric NOT NULL CHECK (quantity > 0),
  exercise_price numeric,
  total_cost numeric,
  method text NOT NULL DEFAULT 'cash',
  note text,
  status text NOT NULL DEFAULT 'pending',
  decision_note text,
  decided_by uuid,
  decided_at timestamptz,
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ct_exercise_requests_company_idx ON public.ct_exercise_requests(company_id);
CREATE INDEX IF NOT EXISTS ct_exercise_requests_stakeholder_idx ON public.ct_exercise_requests(stakeholder_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ct_exercise_requests TO authenticated;
GRANT ALL ON public.ct_exercise_requests TO service_role;
ALTER TABLE public.ct_exercise_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins manage exercise requests"
  ON public.ct_exercise_requests FOR ALL TO authenticated
  USING (public.ct_can_manage(company_id))
  WITH CHECK (public.ct_can_manage(company_id));

CREATE POLICY "Company viewers read exercise requests"
  ON public.ct_exercise_requests FOR SELECT TO authenticated
  USING (public.ct_can_view(company_id) OR public.ct_is_holder(stakeholder_id));

CREATE POLICY "Holders raise their own exercise requests"
  ON public.ct_exercise_requests FOR INSERT TO authenticated
  WITH CHECK (public.ct_is_holder(stakeholder_id) AND status = 'pending');

CREATE POLICY "Holders withdraw their own pending requests"
  ON public.ct_exercise_requests FOR UPDATE TO authenticated
  USING (public.ct_is_holder(stakeholder_id) AND status = 'pending')
  WITH CHECK (public.ct_is_holder(stakeholder_id) AND status IN ('pending','withdrawn'));

CREATE TRIGGER ct_exercise_requests_updated_at
  BEFORE UPDATE ON public.ct_exercise_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Holder self-access on the ownership records
CREATE POLICY "Holders read their own stakeholder record"
  ON public.ct_stakeholders FOR SELECT TO authenticated
  USING (public.ct_is_holder(id));

CREATE POLICY "Holders read their own securities"
  ON public.ct_securities FOR SELECT TO authenticated
  USING (public.ct_is_holder(stakeholder_id));

CREATE POLICY "Holders read their own transactions"
  ON public.ct_transactions FOR SELECT TO authenticated
  USING (
    public.ct_is_holder(stakeholder_id)
    OR (counterparty_stakeholder_id IS NOT NULL AND public.ct_is_holder(counterparty_stakeholder_id))
  );

CREATE POLICY "Holders read vesting behind their own grants"
  ON public.ct_vesting_schedules FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ct_securities s
      WHERE s.vesting_schedule_id = ct_vesting_schedules.id
        AND public.ct_is_holder(s.stakeholder_id)
    )
  );

CREATE POLICY "Holders read documents linked to their own records"
  ON public.ct_documents FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ct_securities s
      LEFT JOIN public.ct_holder_permissions p ON p.stakeholder_id = s.stakeholder_id
      WHERE linked_type = 'security'
        AND linked_id = s.id
        AND public.ct_is_holder(s.stakeholder_id)
        AND coalesce(p.can_view_documents, true)
    )
  );

CREATE POLICY "Holders read the company behind their own holdings"
  ON public.ct_companies FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ct_stakeholders s
      WHERE s.company_id = ct_companies.id AND public.ct_is_holder(s.id)
    )
  );
