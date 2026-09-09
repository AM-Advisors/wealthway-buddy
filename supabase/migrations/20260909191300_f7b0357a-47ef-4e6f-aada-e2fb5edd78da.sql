CREATE TABLE public.offering_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL UNIQUE REFERENCES public.offerings(id) ON DELETE CASCADE,
  headline text NOT NULL DEFAULT '',
  overview text NOT NULL DEFAULT '',
  strategy text NOT NULL DEFAULT '',
  opportunity text NOT NULL DEFAULT '',
  terms text NOT NULL DEFAULT '',
  use_of_proceeds text NOT NULL DEFAULT '',
  team text NOT NULL DEFAULT '',
  risks text NOT NULL DEFAULT '',
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offering_memos TO authenticated;
GRANT ALL ON public.offering_memos TO service_role;

ALTER TABLE public.offering_memos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fund team manages memos"
  ON public.offering_memos FOR ALL TO authenticated
  USING (public.can_manage_diligence(offering_id))
  WITH CHECK (public.can_manage_diligence(offering_id));

CREATE POLICY "Investors read published memos"
  ON public.offering_memos FOR SELECT TO authenticated
  USING (is_published = true AND public.can_view_diligence(offering_id));

CREATE TRIGGER offering_memos_updated
  BEFORE UPDATE ON public.offering_memos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();