CREATE TABLE public.cap_table_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.investor_applications(id) ON DELETE CASCADE,
  changed_by uuid,
  field text NOT NULL,
  old_value text,
  new_value text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cap_table_changes TO authenticated;
GRANT ALL ON public.cap_table_changes TO service_role;

ALTER TABLE public.cap_table_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers and admins read cap table changes"
ON public.cap_table_changes
FOR SELECT
TO authenticated
USING (public.can_manage_diligence(offering_id));

CREATE INDEX cap_table_changes_offering_idx ON public.cap_table_changes (offering_id, created_at DESC);
CREATE INDEX cap_table_changes_application_idx ON public.cap_table_changes (application_id, created_at DESC);