ALTER TABLE public.diligence_rooms
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'fund';

ALTER TABLE public.diligence_rooms
  DROP CONSTRAINT IF EXISTS diligence_rooms_entity_type_check;

ALTER TABLE public.diligence_rooms
  ADD CONSTRAINT diligence_rooms_entity_type_check
  CHECK (entity_type IN ('fund', 'startup'));