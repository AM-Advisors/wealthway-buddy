# Fix "profile documents could not be loaded" and "Harmonious operations access is required"

## What we know
- Message 1 (fund manager Erebor page) comes from the shared profile-document lookup. It replaces any database error with this generic text, so the real cause is hidden. The needed column exists, so a missing column is ruled out.
- Message 2 (Operations → Funds) is shown for **any** failure loading the funds list, not just missing access. Staff with valid access can see it when the list fails for another reason (timeout, one bad fund record, expired session).
- No server errors were logged in the last hour. The root cause is not confirmed yet.

## Steps
1. Reproduce each error signed in (a staff account and Dustin's manager view of Erebor), then capture the real server error.
2. Profile documents: fix the actual failing query (likely the combined profile/onboarding filter or permissions on investor documents). A failure to load reusable documents should not block the whole fund page. That section should show a small notice while the rest of the page loads.
3. Operations Funds: show "access required" only when the server actually refuses access. Other failures should show "Funds couldn't load — Retry" and record the real error.
4. Look for the same "hide every error behind one message" pattern in other shared pages (Investment Readiness uses it too) and fix those the same way.
5. Add tests: a refused-access response still shows the access message; other failures show the retry message; a document lookup failure doesn't break the fund page.

## Unchanged
Access rules stay as they are. Nobody gains access; only the error handling and the failing lookup change.

## Technical notes
- `src/lib/profile-document-evidence.server.ts`: log the error code and message, keep the scope recheck, and confirm the `.or()` filter against the real data.
- `src/components/ops-funds-dashboard.tsx` and `investment-readiness.tsx`: tell 401/403 apart from other errors and add retry.
