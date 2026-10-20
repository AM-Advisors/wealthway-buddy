## Technical details
- Onboarding `fff7829f-…`: stage `verification`, `application_id` and `investor_user_id` are set, and application `kyc_status` is `pending`.
- `offerings.didit_workflow_id` is null for CORPS EREBOR. `fundWorkflowIdForApplication` returns null in that case, and the platform `DIDIT_WORKFLOW_ID` applies (the secret is set).
- Not verified: an actual Start Verification call as Calvin. That needs his session and would create a provider session.
