ALTER TABLE public.fund_team_grants ADD COLUMN scope text NOT NULL DEFAULT 'fund';
COMMENT ON COLUMN public.fund_team_grants.scope IS 'Grant breadth: fund = this offering only; all_managed = every fund the granting manager manages; all_funds = every fund on the platform (staff-granted only). offering_id remains the fund context the grant was created from.';
ALTER TABLE public.fund_team_grants ADD CONSTRAINT fund_team_grants_scope_check CHECK (scope IN ('fund', 'all_managed', 'all_funds'));
DROP INDEX public.fund_team_grants_one_active;
CREATE UNIQUE INDEX fund_team_grants_one_active ON public.fund_team_grants (offering_id, lower(grantee_email), scope) WHERE (status = 'active');