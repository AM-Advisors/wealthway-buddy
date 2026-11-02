# One combined investor list on the Investors tab

## What it looks like today
The fund's Investors tab has several separate pieces. Each one counts or lists investors in its own way:
- A row of 4 count boxes (Investors, Waiting on investor, Waiting on Harmonious, Ready or funded)
- Inner tabs: Investors, Invitations, Work queue (staff only) and Settings
- For migrated funds, staff also see migration status and migration payment cards above everything
- A capital tie-out report below everything

So "what's done" is split across the boxes, the list, the invitations and the work queue.

## What changes
1. **The count boxes become filters.** The 4 boxes stay at the top. Clicking one filters the list below (for example "Waiting on Harmonious"). Clicking it again shows everyone. The selected box is highlighted.
2. **One list for everyone.** Invited people who haven't started appear in the same list, with an "Invited" status and a Resend button on their row. The separate Invitations tab is removed.
3. **One clear status per row.** Each row shows the name, the amount, one status and a "Done X of Y" progress line. Under that is the next step and who owns it, so staff can see what is finished without opening the work queue.
4. **Work queue folded in (staff).** The work queue's next action and owner already show on each row, so its separate tab is removed. A "Waiting on Harmonious" filter covers the same list.
5. **Less clutter around the list.** Settings, migration status, migration payments and the capital tie-out move into one collapsed "More for this fund" section below the list. Nothing is deleted.

## What stays the same
- Who can see or do what, every action in the row menu, the Add investor and Copy link buttons, and the investor record pages.
- No records, approvals or emails change.

## Technical details
- `manager-fund-investors.tsx`: the summary buttons set a local `bucket` filter that reuses the existing `managerBucketOf` and the `?bucket=` drill-down. The Invitations rows (`pendingOnboard`, `pendingAccess`) render inside the main list with `ResendInviteButton`. The `extraTabs` "queue" and "settings" tabs are replaced by a collapsible section.
- `fund-workspace.tsx`: stop passing the queue tab, and move `FundMigrationStatus`, `MigrationPaymentsCard` and `CapitalTieReport` into the collapsible section (still staff-gated).
- The progress line uses the existing readiness row counts (done and total) that are already loaded. No new server reads.
- Add a small test for the filter mapping (each box maps to the right bucket, and invited people count under "Waiting on investor").
