# Identity check for every account before portal access

## What people will see

1. Someone accepts an invitation (or signs in) and accepts the privacy policy and terms, as they do today.
2. **New step: "Verify your identity."** They see a short screen explaining why, then start the identity check: government ID, a selfie, their address, and sanctions/AML screening. This uses the identity provider the app already uses for investors.
3. Until the check is approved they can't open any part of the portal. That covers the client portal, fund pages, the investor portal, the cap table and the Operations screens. Only this screen, sign-out and the legal pages work.
4. **Outcomes:**
   - **Approved:** they go straight into the portal.
   - **In progress:** a "We're checking your details" screen that refreshes on its own.
   - **Needs review:** a waiting screen. A Harmonious compliance person approves or declines them.
   - **Declined or expired ID:** they're told what went wrong and can try again.
5. **Who is covered:** every client user, fund manager, team member and investor. Harmonious staff skip it.
6. **Existing accounts:** everyone who isn't staff must pass at their next sign-in. Anyone who already passed the identity check for a fund investment is counted as verified and isn't asked again.

## Harmonious side

- **New "Account identity checks" queue in Operations Compliance:** it shows each person, their status, when they started, and any provider warnings (no ID numbers; last four digits only).
- **Approve or decline:** a compliance person approves or declines anyone marked "Needs review", and declining requires a note. You can't decide your own check.
- **History:** every decision is kept in a permanent history that can't be edited.
- **Retry:** a person can be sent back to try again, for example after an expired ID.

## Not included

- No change to the investor About You → Verification → Sign → Fund steps. A fund investment still has its own checks, and an account check that's already approved fills in the identity part.
- No emails beyond what the identity provider already sends.

## Technical details

- **New table `account_identity_checks`:**
  - Columns: user_id, person_id, provider session_id/url, vendor_data `acct:<id>`, status (not_started/pending/review/approved/declined/expired), normalized decision summary, warnings, decided_by/decided_at/decision_note, timestamps.
  - Access: service_role only, with RLS on.
  - Plus an append-only `account_identity_check_events` table, protected by a DB trigger that blocks updates and deletes.
- **New `src/lib/account-kyc.server.ts`:**
  - `accountKycStatus(userId)`: staff → exempt; an approved `kyc_verifications` row for the user or their person → approved (grandfathered); otherwise the latest check.
  - `startAccountCheck`: reuses the existing Didit session starter with an `acct:` vendor_data prefix and person prefill.
  - `recordAccountDecision`: called from the existing Didit webhook when vendor_data starts with `acct:`; uses `normalizeDiditDecision`; expired IDs map to expired.
  - `decideAccountCheck`: staff with the compliance permission only; not your own check; a note is required to decline.
- **`src/lib/account-kyc.functions.ts`:** status, start, reconcile (poll the provider), plus the staff queue, decide and send-back functions.
- **New `AccountKycGate` component:**
  - Mounted inside `PolicyGate` in `src/routes/_authenticated/route.tsx`, and in the `src/routes/investor.tsx` shell.
  - Renders the verification screens instead of `<Outlet />` until approved.
  - Returns from the provider land back on the gate, which reconciles.
- **Server-side enforcement:**
  - `src/lib/require-auth.ts` gains a check: non-staff, non-approved users get 403 "Identity verification required" from every protected server function.
  - Exceptions: a short allowlist (policies, account-KYC functions, sign-out/session, workspace list).
  - Status is cached per request and cheap: one indexed lookup.
- **Webhook:** `src/routes/api/public/webhooks/didit.ts` routes `acct:` sessions to the account handler; signature verification is unchanged.
- **Operations queue:** a new tab in the existing compliance area, gated by the existing administration/compliance atomic permission.
- **AGENTS.md rule:** account identity verification gates all non-staff access server-side; investment-level KYC stays separate and is satisfied by an approved account check.
- **Tests:** unit tests for status resolution (exempt, grandfathered, review blocks, declined retry), plus an e2e check that a fresh synthetic user is blocked until approved.
