ALTER TABLE public.wix_member_imports
  ADD COLUMN linked_person_id uuid,
  ADD COLUMN review_action text CHECK (review_action IN ('linked','created')),
  ADD COLUMN reviewed_by uuid,
  ADD COLUMN reviewed_at timestamptz;
COMMENT ON COLUMN public.wix_member_imports.linked_person_id IS 'Person confirmed by staff (link to existing or newly created). matched_person_id stays a suggestion only.';