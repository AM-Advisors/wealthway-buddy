ALTER TABLE public.fund_team_members ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.fund_team_members ADD COLUMN IF NOT EXISTS added_as text;
ALTER TABLE public.fund_team_members ADD COLUMN IF NOT EXISTS roles_confirmed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS fund_team_members_requester_uniq ON public.fund_team_members (offering_id, user_id) WHERE user_id IS NOT NULL AND removed_at IS NULL;