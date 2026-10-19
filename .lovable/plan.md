# Bring over the V2.5 additions, aligned to today's platform

We build this in the recommended order. Each feature sits on top of the records the platform already keeps. Nothing is copied from V2.5's sample figures or from things it only saved in the browser.

## Phase 0: Check what already exists (first step)
- Compare each item with what is in the current app. Record history and compliance schedules may already be partly built.
- Reuse and extend anything that exists. Never build a second version of it.

## Phase 1: Unified record history
- One searchable timeline for each fund, client and investor: who changed what, when, before and after, and the reason.
- It reads from the audit logs and correction trails the platform already has, and changes nothing.
- Staff see it in Operations. Fund managers see only their own funds. Investors don't see it.

## Phase 2: Finish Portfolio and Report Cards
- Richer exposure views: concentration by sector, geography and vintage, cohort charts, and trends over time.
- An editor for multiple assessment metrics, tied to the existing grading setup and approvals.
- Controlled sharing: each share link expires, is limited to one card version, can be revoked, and logs every view. Private investor risk answers are never shared.

## Phase 3: Compliance report schedules
- Recurring internal reports, with approved recipients, an approval step before each send, and a delivery history.
- These are reports only. They never file, pay or move money.

## Later (after Phases 1–3)
- Cap-table financing scenarios: a sandbox that never changes actual holdings.
- Valuation sensitivity: kept separate from approved asset values.
- Consolidated client review screen.

## Rules kept throughout
- Permissions are checked on the server. Client and Operations stay separate. A second approver is still required (no approving your own work), and corrections stay permanent.
- No automated filings, payments or money movement.
- Each phase gets focused automated checks. Signed-in walkthroughs stay blocked until an isolated test (QA) environment is available.

## Technical details
- History: a read-only server function that combines the existing audit and change tables, with scope filters based on manager and staff roles.
- Sharing: a new table for share grants (hashed token, expiry, revoked flag) plus an access log, available to the service role only.
- Schedules: extend the existing schedule records if they exist. Sends go through the existing approval alert path and the email queue.
