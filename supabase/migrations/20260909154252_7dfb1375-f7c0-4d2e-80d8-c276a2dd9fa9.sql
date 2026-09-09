CREATE TABLE public.application_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES public.investor_applications(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  funded_amount_cents bigint NOT NULL,
  closing_date date NOT NULL,
  status text NOT NULL DEFAULT 'closed',
  note text,
  closed_by uuid NOT NULL,
  closed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_closings TO authenticated;
GRANT ALL ON public.application_closings TO service_role;

ALTER TABLE public.application_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage closings"
ON public.application_closings FOR ALL TO authenticated
USING (public.can_manage_diligence(offering_id))
WITH CHECK (public.can_manage_diligence(offering_id));

CREATE POLICY "Investors read their own closing"
ON public.application_closings FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.investor_applications a
  WHERE a.id = application_closings.application_id AND a.user_id = auth.uid()
));

CREATE TRIGGER application_closings_updated_at
BEFORE UPDATE ON public.application_closings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX application_closings_offering_idx ON public.application_closings(offering_id);

CREATE TABLE public.closing_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_id uuid NOT NULL REFERENCES public.application_closings(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.investor_applications(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  title text NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  size_bytes bigint,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.closing_documents TO authenticated;
GRANT ALL ON public.closing_documents TO service_role;

ALTER TABLE public.closing_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage closing documents"
ON public.closing_documents FOR ALL TO authenticated
USING (public.can_manage_diligence(offering_id))
WITH CHECK (public.can_manage_diligence(offering_id) AND uploaded_by = auth.uid());

CREATE POLICY "Investors read their own closing documents"
ON public.closing_documents FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.investor_applications a
  WHERE a.id = closing_documents.application_id AND a.user_id = auth.uid()
));

CREATE INDEX closing_documents_closing_idx ON public.closing_documents(closing_id);