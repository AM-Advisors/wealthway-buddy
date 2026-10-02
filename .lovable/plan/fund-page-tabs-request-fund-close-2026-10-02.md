# Fund page tabs + Request Fund Close

The Figma file can't be opened from here (no live Figma access). Layout follows the current Harmonious style: fund name, status badge and the four summary numbers stay at the top, then a tab bar. A screenshot of the Figma frame lets me match it exactly.

## Header (always visible)
- Back link, fund name, legal name, "In setup" / "Open to investors" badge.
- **Request Fund Close** button on the right, so it's reachable from any tab.
- Summary: Setup complete, Investors, Committed, Funded (reconciled).

## Tabs
1. **Fund Details**: type, exemption, target raise, state and date formed, side letters, "Waiting on you" steps, setup progress.
2. **Investors**: the current read-only cap table (investor, class, stage, committed, funded, %, side letter).
3. **Banking**: the fund's bank accounts (masked numbers) and reconciled funding totals. Read-only. Wire instructions stay out of this tab.
4. **Taxes**: tax status for the year (1065 / state / K-1 / 1042-S progress) and filed documents. View only, with no filing actions.
5. **Assets**: portfolio holdings and their latest valuation, read-only.
6. **Closes**: past and pending close requests with their status, plus the Request Fund Close button.

Each tab shows a friendly "Nothing here yet" message when there's no data.

## Informational vs approval
- Tabs that only show information (Details, Investors, Banking, Taxes, Assets) have no approve or sign-off step. They're read-only views.
- Approval is kept only where it already exists for compliance: "Waiting on you" answers are still reviewed by Harmonious, and close requests are still reviewed by Operations.

## Request Fund Close
- A dialog where the manager picks the investors to include (from the cap table), a target close date and optional notes.
- Each investor shows their readiness ("Ready" / "Not ready: reason") from the existing readiness checklist. Not-ready investors can be selected but get a warning.
- Submitting creates a close request with status "Submitted - Harmonious reviewing" and alerts Operations in the app. It sends no emails and doesn't move money, file Form D or Blue Sky, or close anything automatically.
- Operations sees it in a new Close Requests queue and can mark it In review, Completed or Returned (with a note). The manager sees that status on the Closes tab.
- Form D ($160 Harmonious fee) and Blue Sky fees are shown as an estimate only. Charging for them comes in a later step.

## Technical details
- `client.funds.$fundId.tsx`: shadcn `Tabs`, with the tab stored in the `?tab=` search param so links can point to a tab. Existing sections move into tabs unchanged.
- New read-only server functions in `fund-cap-table.functions.ts` (banking summary, tax summary, assets), each gated by the existing `isClientMemberOfFund`/staff check and reading through the admin client after that check. They reuse existing tables (bank_accounts / bank reconciliation, tax phase 4 records, portfolio assets/valuations). Bank numbers are masked on the server.
- Migration: `fund_close_requests` (offering_id, client_id, requested_by, target_date, notes, investment_ids uuid[], status submitted/in_review/completed/returned, staff_note, timestamps) plus append-only `fund_close_request_events`. Includes GRANTs and RLS (fund members read their fund's rows, staff read all; writes only go through server functions).
- `fund-close-requests.functions.ts`: `listFundCloseRequests`, `createFundCloseRequest` (server checks membership and that the investments belong to the fund), `updateFundCloseRequestStatus` (staff only, note required to return).
- Operations queue: a new admin route listing close requests, under the existing Operations navigation.
- Rule added to `src/lib/AGENTS.md`: close requests are manager-submitted and staff-reviewed, and are never executed automatically.

## How to test
Sign in as a fund manager and open a fund. Click through all six tabs, then use Request Fund Close and check it appears on the Closes tab and in the Operations Close Requests queue.
