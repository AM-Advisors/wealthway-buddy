CREATE TABLE public.person_account_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  added_by uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  note text,
  removed_by uuid,
  removed_at timestamptz
);
CREATE UNIQUE INDEX person_account_group_members_active ON public.person_account_group_members(user_id) WHERE removed_at IS NULL;
CREATE INDEX person_account_group_members_group ON public.person_account_group_members(group_id);
COMMENT ON TABLE public.person_account_group_members IS 'Staff-only insight: separate login accounts known to belong to one person. Never merges accounts or shares records.';
GRANT ALL ON public.person_account_group_members TO service_role;
ALTER TABLE public.person_account_group_members ENABLE ROW LEVEL SECURITY;