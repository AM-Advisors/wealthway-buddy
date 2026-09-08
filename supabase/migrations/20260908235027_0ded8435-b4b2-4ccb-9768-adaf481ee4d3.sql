CREATE TABLE public.application_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.investor_applications(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'other',
  severity text NOT NULL DEFAULT 'normal',
  note text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_by uuid NOT NULL,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.application_flags TO authenticated;
GRANT ALL ON public.application_flags TO service_role;

ALTER TABLE public.application_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviewers read flags for their funds"
ON public.application_flags FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = application_flags.offering_id AND fm.user_id = auth.uid())
);

CREATE POLICY "Reviewers raise flags for their funds"
ON public.application_flags FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = application_flags.offering_id AND fm.user_id = auth.uid())
  )
);

CREATE POLICY "Reviewers update flags for their funds"
ON public.application_flags FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = application_flags.offering_id AND fm.user_id = auth.uid())
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = application_flags.offering_id AND fm.user_id = auth.uid())
);

CREATE INDEX application_flags_application_idx ON public.application_flags (application_id);
CREATE INDEX application_flags_offering_status_idx ON public.application_flags (offering_id, status);

CREATE TRIGGER application_flags_updated
BEFORE UPDATE ON public.application_flags
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();