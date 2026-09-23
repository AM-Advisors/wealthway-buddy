-- Full destination values (account/routing numbers) must never be readable through the
-- Data API. Only the server engine (service role) reads secured_details.
REVOKE SELECT ON public.investor_payment_instructions FROM authenticated;
REVOKE ALL ON public.investor_payment_instructions FROM anon;
GRANT SELECT (id, investor_user_id, investment_profile_id, offering_id, version, supersedes_id, method, label, beneficiary_name, bank_name, country, currency, masked_account, masked_routing, fingerprint, status, verification_status, verification_method, verified_by, verified_at, approved_by, approved_at, effective_date, cooling_off_until, cooling_off_waived_by, cooling_off_waiver_reason, revoked_by, revoked_at, superseded_at, created_by, created_at, updated_at) ON public.investor_payment_instructions TO authenticated;
GRANT ALL ON public.investor_payment_instructions TO service_role;