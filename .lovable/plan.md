# Closed fund status with approved reopening

## What you'll get
- A fund status: **Open**, **Closed** (separate from "not launched yet").
- Closing a fund: a fund manager or Harmonious Operations clicks **Close fund**, gives a reason, and it takes effect right away.
- While closed:
  - New investments are refused everywhere: invite links, personal links, the deal room's Continue button, "Add new investment profile", staff-added investors and new applications. People see "This fund is closed to new investments."
  - Fund documents are hidden from prospective investors (deal room and invite pages).
  - Existing investors keep their own signed documents, statements and tax forms. Investments that are partway through keep going so nobody gets stuck halfway.
- Reopening: anyone allowed to close the fund can **request to reopen**, with a reason. A fund manager of that fund who did not make the request must approve it. Super Admins can approve their own request, and the reason is logged permanently. The fund stays closed until someone approves.
- History: every close, reopen request, approval and rejection shows on the fund's Record history and the audit log. Entries can't be edited.

## Where it appears
- Manager Command Center → Overview: a status badge plus the Close and Reopen controls, with any reopen request that's waiting.
- Operations → Funds → fund → Setup: the same card, reused.
- Investor-facing pages: the closed message replaces the Continue button and the documents.

## Technical details
- Migration: add `offerings.lifecycle_status` ('open' | 'closed', default 'open'), `closed_at`, `closed_by`, `closed_reason`. Add an append-only `fund_status_events` table and a `fund_reopen_requests` table (requested_by, reason, status, decided_by, decided_at, decision_reason). Both get GRANTs, RLS and block-mutation triggers. A DB trigger refuses new `investor_onboarding` / investment inserts and new invite-link creation when the fund is closed, so every code path is covered.
- `is_open` (launch/onboarding open) stays as it is. Accepting new investments now requires `is_open && lifecycle_status = 'open'`, through one shared helper `fundAcceptsInvestments()` used by admin-applications, invite and personal links, investor entry, staff-funds and the fund request engine.
- Document hiding goes through the existing deal-room and document_sources readers. Closed funds return no pre-commitment documents. Readers that return investors' own executed documents are unchanged.
- Server functions in `fund-status.functions.ts`. They import `requireSupabaseAuth` from `src/lib/require-auth.ts` and check authority on the server: the requester must be an assigned manager or Operations staff. The approver must be an assigned fund manager other than the requester, or a Super Admin who gives a reason. Approving runs in one DB function that updates the status and writes the event together.
- A shared `FundStatusCard` component is used on both manager and Operations pages, with `invalidateFund` run on change.
- Tests: closed fund refuses a new investment, closed fund hides deal-room documents, existing investor still sees their signed docs, the requester can't approve their own reopen (non-Super Admin), a non-manager can't approve, and an approved reopen accepts investments again.
- Record the rule in AGENTS.md.

## Assumptions to confirm
- "Manager approval" means a fund manager of that fund, different from the person who asked.
- Investments already in progress continue after the fund closes. Only new ones are refused.
