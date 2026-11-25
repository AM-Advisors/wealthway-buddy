# Combine Requests and Activity into one "Activity & requests" tab

## Why
Right now, the Requests tab only shows service requests and investor update posts. Activity only shows the fund history, the calendar and (for staff) the older fund record. A lot of fund work isn't on either tab. Erebor, for example, has 3 open investor to-dos and 2 bank setup requests that neither tab shows.

## What people will see
One top tab called **Activity & requests**, in the same place for fund managers and Operations. It has four sub-views:

1. **Open items** (the default view). One list of everything still waiting on this fund, grouped as Needs you, Harmonious handling and Waiting on someone else. Each row shows:
   - what it is
   - who it's waiting on
   - the due date
   - an "Open" button that goes to the place where that item is already handled
2. **Requests.** The current service requests list and the Request Service button, unchanged.
3. **History.** One timeline of everything that happened on the fund, with search and filters by type. It combines today's history with close, filing, request, task, signature and notice events.
4. **Calendar.** Unchanged.

Other changes:
- **Investor updates** move to the Investors tab. They're posts to investors, not requests.
- **Staff only:** the old fund record stays as a fifth sub-view called "Record".
- **Old links keep working.** Links to `?tab=requests` or `?tab=activity` land on the new tab.

## What "Open items" will include
Every type of item the fund can have:
- Service requests (`fund_service_requests`)
- Staff tasks for this fund (staff only)
- Fund setup requests and new-fund drafts
- Close requests, including drafts
- Fee, side letter and locked-edit change requests
- Document change requests
- Signatures waiting:
  - investor documents and countersignatures
  - fund files
  - SS-4
  - W-9
- Investor to-dos (open readiness tasks) and investor reminders
- Form D, Blue Sky, state filings and franchise fees that are still open
- Bank setup, wire, reopen and migration requests
- Pricing approval requests (staff only)

## Rules kept
- **The list only shows items.** Approving, signing or sending still happens in the existing screens, with the same checks as today.
- **Each item is checked server-side.** It appears only if that person is allowed to see it on that fund. Fund managers never see staff task details, internal notes or provider details.
- **Nothing is copied.** The list reads the original records directly, so it can't fall out of sync.

## Checking that nothing is missing
- A test makes sure every item type has a matching entry in the list. Adding a new type without one fails the build.
- A test checks counts on fictional data, separately for a manager and for staff.
- Erebor's counts are compared read-only against the original records. Nothing is changed during the check.

## Technical details
- `fund-tab-map.ts`:
  - replace the `requests` and `activity` top tabs with `activity` (group: `open`, `requests`, `audit`, `calendar`, `record`)
  - redirect `requests` to `requests` inside the new tab, and `activity` to `open`
- New `src/lib/fund-work-model.ts`. A pure `FUND_WORK_SOURCES` registry (key, label, owner side, link builder) plus `normalizeFundWork()`.
- New `src/lib/fund-work.functions.ts`. Runs `assertFund` once, then runs the readers in parallel with per-source limits, and filters by audience. A source that fails shows as "Couldn't load X" instead of quietly disappearing.
- New `src/components/fund-open-items.tsx`. Uses `useSuspenseQuery`, filter chips, and "Open" links built from the existing routes and tab values.
- `fund-audit.functions.ts`: History adds `fund_regulatory_events` (nothing reads it today), `fund_close_request_events`, `fund_request_events`, `staff_task_events` (staff only), `fund_state_filing_events` and `notification_events`.
- `FundUpdatesPanel` moves into the Investors tab.
- Update the `AGENTS.md` fund-tab rule.
