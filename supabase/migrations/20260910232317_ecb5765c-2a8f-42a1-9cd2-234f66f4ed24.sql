CREATE TABLE public.client_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL,
  assignment_role text NOT NULL DEFAULT 'lead',
  note text,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, staff_user_id),
  CONSTRAINT client_assignments_role_check CHECK (assignment_role IN ('lead','support'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_assignments TO authenticated;
GRANT ALL ON public.client_assignments TO service_role;

ALTER TABLE public.client_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client assignments readable by staff" ON public.client_assignments FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "client assignments managed by contract staff" ON public.client_assignments FOR ALL TO authenticated
  USING (private.can_manage_contracts(auth.uid())) WITH CHECK (private.can_manage_contracts(auth.uid()));

CREATE INDEX client_assignments_staff_idx ON public.client_assignments (staff_user_id);
CREATE INDEX client_assignments_client_idx ON public.client_assignments (client_id);

CREATE TRIGGER client_assignments_updated_at BEFORE UPDATE ON public.client_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();