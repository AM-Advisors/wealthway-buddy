# Resend invite — one consistent option everywhere

## Goal
A single, recognizable "Resend invite" action on every surface that shows invited people. Clicking it emails a fresh one-time link (the old link stops working), updates the sent time, and shows the latest delivery confirmation.

## Current state (verified)
Resend already exists but is inconsistent:
- People & Access (`people-directory.tsx`): Resend only on the Invited tab list; not in each person's actions menu.
- Client people list (`client-admin.tsx`): shows "Re-invite", which opens the full invite dialog instead of a quick resend.
- Fund invitations (`fund-invitations.tsx`) and fund investor lists (`manager-fund-investors.tsx`): already have resend.
- Contact directory (`contact-directory-table.tsx`): already has resend.

## Changes

1. **One shared action component** — `src/components/invite-resend.tsx`: a button/menu item that takes the invitation reference, calls the existing server function, confirms with a toast ("Invitation resent with a fresh link"), and disables while sending. No new server logic: reuse `resendInvitation` from `src/lib/user-access.functions.ts` (account invites) and `src/lib/invitations.functions.ts` (fund invitations), and the investor onboarding resend where a fund row is onboarded.

2. **Normalize every surface to that component**
   - People & Access: add Resend to each person's ⋯ actions menu (next to Send password reset), keep the Invited-tab Resend.
   - Client people list: person already invited shows "Resend invite" as a one-click action; "Invite" stays for people never invited, and the full dialog remains reachable for changing role/fund.
   - Fund invitations, fund investor lists, contact directory: swap their bespoke buttons for the shared component (same behavior, consistent wording and icon).

3. **Delivery insight next to the action** — show last sent time and the confirmed-delivery status already tracked by the invite-delivery work (`src/lib/user-email-audit.server.ts`, `src/lib/user-insights-model.ts`) as a small status line/badge beside each invite row, so staff can resend-and-verify without leaving the list. Older invites without delivery confirmation keep their existing "unconfirmed" display.

## Safety
- No authorization changes: every resend still goes through the existing server functions, which re-check the caller's role server-side.
- No new emails without an explicit click; resend cancels/invalidates the prior link exactly as today.

## Verification
- Build passes; targeted checks that every invite-bearing surface renders the shared action.
- Signed-in click-through is limited without a test account, so the user should try one resend on a test invite to confirm delivery shows.
