DROP INDEX IF EXISTS public.investor_onboardings_unique_profile;
CREATE UNIQUE INDEX investor_onboardings_unique_profile
  ON public.investor_onboardings USING btree (offering_id, investor_user_id, investment_profile_id)
  WHERE investment_profile_id IS NOT NULL AND removed_at IS NULL;