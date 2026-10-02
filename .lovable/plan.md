# Fund-side and Harmonious-side enhancements

## Fund side (fund managers)
1. **My Funds follows the chosen account**: My Funds lists only the funds belonging to the client account picked in Switch workspace. Funds where the person is only an investor still show up, under their own heading.
2. **Invite to a second account**: inviting an email that already has a login links that person to the new client account. Their other accounts stay as they are, and the new account appears in Switch workspace the next time they sign in. Accepting the invite still requires the invited person to be signed in with that email.
3. **Fund health summary**: each fund card and the top of each fund page show setup %, investors funded / committed, open to-dos, and the next regulatory deadline. This is read-only and built from the existing readiness, funding and calendar data.
4. **Investor reminders**: on the Investors tab, the manager can pick investors stuck on Verification, Sign or Fund and click "Send reminder". It sends a Brevo email linking to their onboarding step, at most once per investor every 3 days, and each reminder is logged on the investor's activity. Reminders never move money or change status.

## Harmonious side (Operations)
5. **Work queue across all clients**: one Operations page combining pending task reviews, close requests awaiting approval, wire/ACH payments to confirm, filings to prepare or record, pricing approvals and fund-manager inbox messages. You can filter by client, type, assigned team member and age. Each item links to the screen where it is already handled; nothing gets approved from the queue itself.
6. **Manager account map**: in Access Control, each person shows every client account and fund they belong to. Staff can add someone to another client account or remove them, and every change is recorded in the access audit log. This uses the existing permission checks that prevent people from giving themselves more access.
7. **Stuck-fund alerts**: flags funds that have had no progress for 7+ days, or a deadline within 14 days. The flags appear on the work queue and the Funds list. They are worked out each time the page is viewed, so nothing runs in the background and no emails go out.
8. **Client 360 timeline**: a Timeline tab on each client in Operations that combines messages, payments, close requests, filings, approvals, team changes and access changes in date order. It is read-only and shows only what staff are already allowed to see.

## Out of scope
- No automated filings, payments or money movement.
- No new background jobs.
- Reminders are the only new emails.

## Technical details
- My Funds: `getMyFunds` takes `clientId` from `activeClientId` and checks it server-side against the person's facts; it splits the result into managed funds and investor funds.
- Invite: the client invitation accept path adds a `client_users` row for an existing user (an upsert, so other memberships are untouched). The Access Control Invite tab allows existing emails.
- Health: new pure `fund-health.ts` and a batched server function; reuses `investment-readiness`, `funding-status` and regulatory calendar helpers.
- Reminders: new `investor_reminders` table (append-only, with grants and RLS so only staff and fund managers can read). The server function checks the manager's Investors permission and the 3-day limit, then sends through the existing Brevo sender.
- Work queue: `ops-work-queue.server.ts` gathers from the existing tables. It extends `attention.server.ts` where possible and is gated by Operations capabilities. Route `ops.queue.tsx`, added to the ops sidebar.
- Account map: extend `access-control.server.ts` projection; writes go only through `access-admin.functions.ts` with escalation checks and `access_audit_events`.
- Stuck rule: pure function in `fund-health.ts` using the latest activity timestamp per fund, with the 7- and 14-day thresholds as named constants.
- Timeline: `client-timeline.server.ts` merges the events tables with a limit and date-based paging; a new tab on `ops.clients.$clientId.tsx`.
- Add unit tests for the health and stuck rules, the reminder limit and the timeline merge. Record new rules in `src/lib/AGENTS.md`.

## Testing in preview
- **As a fund manager:** switch accounts and check My Funds; check the health strip on a fund; send a reminder to a test investor and confirm the second click is blocked.
- **As staff:** open the Work queue and filter by client; add the test manager to a second client in Access Control; open a client's Timeline.
