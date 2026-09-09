CREATE TABLE public.pitch_decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL UNIQUE REFERENCES public.offerings(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Pitch deck',
  summary text,
  deck_file_path text,
  deck_file_name text,
  deck_file_size_bytes bigint,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pitch_deck_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL REFERENCES public.pitch_decks(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  image_path text NOT NULL,
  image_name text,
  heading text,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pitch_deck_slides_deck_idx ON public.pitch_deck_slides (deck_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pitch_decks TO authenticated;
GRANT ALL ON public.pitch_decks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pitch_deck_slides TO authenticated;
GRANT ALL ON public.pitch_deck_slides TO service_role;

ALTER TABLE public.pitch_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pitch_deck_slides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Room viewers read pitch decks" ON public.pitch_decks
  FOR SELECT TO authenticated USING (public.can_view_diligence(offering_id));
CREATE POLICY "Managers write pitch decks" ON public.pitch_decks
  FOR ALL TO authenticated
  USING (public.can_manage_diligence(offering_id))
  WITH CHECK (public.can_manage_diligence(offering_id));

CREATE POLICY "Room viewers read pitch deck slides" ON public.pitch_deck_slides
  FOR SELECT TO authenticated USING (public.can_view_diligence(offering_id));
CREATE POLICY "Managers write pitch deck slides" ON public.pitch_deck_slides
  FOR ALL TO authenticated
  USING (public.can_manage_diligence(offering_id))
  WITH CHECK (public.can_manage_diligence(offering_id));

CREATE TRIGGER pitch_decks_set_updated_at BEFORE UPDATE ON public.pitch_decks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();