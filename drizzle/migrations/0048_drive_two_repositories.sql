ALTER TABLE public.drive_folder_mappings ADD COLUMN IF NOT EXISTS repository text NOT NULL DEFAULT 'fund' CHECK (repository IN ('fund','investor','test'));
ALTER TABLE public.drive_folder_mappings DROP CONSTRAINT IF EXISTS drive_folder_mappings_entity_kind_check;
ALTER TABLE public.drive_folder_mappings ADD CONSTRAINT drive_folder_mappings_entity_kind_check CHECK (entity_kind IN ('fund','investor','investor_fund'));
ALTER TABLE public.drive_folder_mappings DROP CONSTRAINT IF EXISTS drive_folder_mappings_check;
ALTER TABLE public.drive_folder_mappings ADD CONSTRAINT drive_folder_mappings_check CHECK (
  (entity_kind IN ('fund','investor_fund') AND investment_profile_id IS NULL)
  OR (entity_kind = 'investor' AND investment_profile_id IS NOT NULL));
-- Investor-level folders may never live in the broad Fund repository.
ALTER TABLE public.drive_folder_mappings ADD CONSTRAINT drive_folder_mappings_repo_check CHECK (
  (entity_kind = 'fund' AND repository IN ('fund','test'))
  OR (entity_kind IN ('investor','investor_fund') AND repository IN ('investor','test'))) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS drive_folder_mappings_investor_fund_uq ON public.drive_folder_mappings (offering_id) WHERE entity_kind = 'investor_fund';
COMMENT ON COLUMN public.drive_folder_mappings.repository IS 'fund = Harmonious Team Funds root; investor = Restricted Investor Records root; test = QA root. Never inferred from one another.';

ALTER TABLE public.drive_exceptions ADD COLUMN IF NOT EXISTS repository text NOT NULL DEFAULT 'fund' CHECK (repository IN ('fund','investor','test'));
ALTER TABLE public.drive_exceptions DROP CONSTRAINT IF EXISTS drive_exceptions_issue_type_check;
ALTER TABLE public.drive_exceptions ADD CONSTRAINT drive_exceptions_issue_type_check CHECK (issue_type IN ('conflict','needs_attention','permission_too_broad','upload_failed','mapping_missing','retry_failed','permission_review','repository_unavailable'));