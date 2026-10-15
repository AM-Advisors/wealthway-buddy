# Force client users to sign the current MSA at login

## Goal

Every user attached to a client account must sign the current published Master Services Agreement before they can use the portal. This applies to brand-new client users and to existing client users whose client signed an older MSA version — anyone who hasn't signed the current version is gated. Staff (Operations/admins), investors, and fund managers without a client account are not gated.

## What exists today

- `msa_versions` + `client_msa_agreements` tables with version tracking.
- `signMsa` server function (typed signature, signer name/title, per-client, per-version) in `src/lib/agreements.functions.ts`.
- MSA signing page at `src/routes/_authenticated/client.agreements.msa.tsx`.
- `getAgreementsHome` already computes `needsReview` (client hasn't signed the current version).
- The `_authenticated/route.tsx` gate is integration-managed (auth only) — it will not be edited.

## Changes

1. **Gate check server function** — new `getMsaGateStatus` in `src/lib/agreements.functions.ts` (POST/GET with `requireSupabaseAuth`): returns `{ gated: boolean, clientId, version }`. A user is gated when they belong to at least one client (via `client_users`) and that client has no `client_msa_agreements` row for the current `msa_versions` row with a signed/executed status. Staff roles (checked server-side via `user_roles`) and users with no client membership return `gated: false`.

2. **Login gate component** — a small guard rendered inside the client app shell (and the post-login home route) that calls `getMsaGateStatus`; when gated, it redirects to `/client/agreements/msa?required=1`. While required mode is active:
   - The MSA page shows the full current agreement text with the existing typed-signature form (signer name, title, signature).
   - Navigation away is blocked: the guard re-redirects from any other client page until signing completes. Client menu items are hidden in required mode.
   - After signing, the user lands on their normal home page.

3. **Multi-client users** — if a user belongs to several clients, they sign once per client that is out of date; the gate clears only when every client they belong to is current.

4. **Audit** — signing already records the agreement row with version, signer, and timestamp; no schema change needed. No new tables, no migration.

## Technical notes

- No edit to the integration-managed `_authenticated/route.tsx`; the gate lives in a child guard component, per the auth-guard rules.
- `signMsa` keeps its existing server-side `assertClientAccess` check — the UI gate never grants anything.
- If no MSA version is published, the gate is off (fails open to avoid locking everyone out).
- Verify: type check, build log, and a Playwright pass confirming a gated user is redirected and cannot reach other client pages until signed.

## Out of scope

- Changing MSA text/versions (publishing a new version is the existing admin flow).
- Gating investors, fund managers, or staff.
