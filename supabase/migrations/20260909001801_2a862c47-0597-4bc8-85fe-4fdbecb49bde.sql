CREATE TABLE public.diligence_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL UNIQUE REFERENCES public.offerings(id) ON DELETE CASCADE,
  box_folder_id text NOT NULL,
  intro text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.diligence_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.diligence_rooms(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  category text NOT NULL,
  title text NOT NULL,
  description text,
  box_file_id text NOT NULL,
  file_name text NOT NULL,
  size_bytes bigint,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX diligence_documents_room_idx ON public.diligence_documents (room_id, category);
CREATE INDEX diligence_documents_offering_idx ON public.diligence_documents (offering_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diligence_rooms TO authenticated;
GRANT ALL ON public.diligence_rooms TO service_role;
GRANT SELECT, INSERT, DELETE ON public.diligence_documents TO authenticated;
GRANT ALL ON public.diligence_documents TO service_role;

ALTER TABLE public.diligence_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diligence_documents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_diligence(_offering_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = _offering_id AND fm.user_id = auth.uid())
  )
$$;

CREATE OR REPLACE FUNCTION public.can_view_diligence(_offering_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.can_manage_diligence(_offering_id)
    OR EXISTS (SELECT 1 FROM public.investor_applications a WHERE a.offering_id = _offering_id AND a.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.investor_fund_access f WHERE f.offering_id = _offering_id AND f.user_id = auth.uid())
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_diligence(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_view_diligence(uuid) FROM PUBLIC;

CREATE POLICY "Room readers" ON public.diligence_rooms FOR SELECT TO authenticated
USING (public.can_view_diligence(offering_id));
CREATE POLICY "Room managers create" ON public.diligence_rooms FOR INSERT TO authenticated
WITH CHECK (public.can_manage_diligence(offering_id) AND created_by = auth.uid());
CREATE POLICY "Room managers edit" ON public.diligence_rooms FOR UPDATE TO authenticated
USING (public.can_manage_diligence(offering_id)) WITH CHECK (public.can_manage_diligence(offering_id));
CREATE POLICY "Room managers delete" ON public.diligence_rooms FOR DELETE TO authenticated
USING (public.can_manage_diligence(offering_id));

CREATE POLICY "Document readers" ON public.diligence_documents FOR SELECT TO authenticated
USING (public.can_view_diligence(offering_id));
CREATE POLICY "Document managers add" ON public.diligence_documents FOR INSERT TO authenticated
WITH CHECK (public.can_manage_diligence(offering_id) AND uploaded_by = auth.uid());
CREATE POLICY "Document managers remove" ON public.diligence_documents FOR DELETE TO authenticated
USING (public.can_manage_diligence(offering_id));

CREATE TRIGGER diligence_rooms_updated BEFORE UPDATE ON public.diligence_rooms
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();