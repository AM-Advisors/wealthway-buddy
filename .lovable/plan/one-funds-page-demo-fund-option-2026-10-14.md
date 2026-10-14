# One Funds page + Demo fund option

## What changes for you

**One Funds page in Operations**
- Today, funds are listed in several places: "Funds" (the dashboard), "All funds", "Fund Setup" (the setup list), and "Investor work by fund". These become one **Funds** page.
- The single page keeps the dashboard's tiles, filters (client, owner, manager, search) and setup progress. It also gets the setup list's actions: **Add Fund or SPV**, **Open**, and **Delete** (for people who could delete before).
- Clicking a fund always opens the same fund page, with its tabs (Overview, Setup, Investors, Banking, Audit History, and so on).
- Old links and bookmarks (Fund Setup, All funds, the older fund board page) send you to the new page or the fund's page, so nothing breaks.
- The menu shows **Funds** once. Duplicate links to the same list are removed. Other tools in that menu (EIN queue, documents, templates and so on) stay.

**Mark as demo fund**
- Each fund's page gets a **Demo fund** switch, for staff who can set up funds. Turning it on or off asks for a short reason and shows up in Audit History.
- Demo funds show a "Demo" badge. They're hidden from the Funds page by default, with a **Show demo funds** toggle to see them.
- Demo funds are left out of the counts and readiness numbers on the Funds page.
- The Walkthrough test fund is marked as a demo fund to start. I'll list any other likely test funds so you can decide on them; I won't mark those myself.
- Marking a fund as a demo only changes how it's shown. It never deletes anything, sends anything, or changes who can see the fund.

## Not changing
- Client and fund manager "My Funds" pages: these already only show that person's own funds.
- Fund Migration (the import workspace) stays separate, because it's for records that aren't real funds yet.

## Technical details
- Migration: `offerings.is_demo boolean not null default false`, plus `demo_marked_by/at`. Event logged to `offering_audit_events` and surfaced in `fundAuditHistoryFn`. Set the Walkthrough offering to true in the migration.
- Server fn `setFundDemoFn` (requireSupabaseAuth + `requireOperations(context,"funds","prepare")`, reason required).
- `src/lib/ops-funds.server.ts`: return `isDemo`; exclude demo from metrics/tiles unless `includeDemo`.
- `src/components/ops-funds-dashboard.tsx`: add the Add Fund button, Delete (`DeleteFundDialog`), Demo badge, and a "Show demo funds" toggle; rows link to `/ops/fund/$fundId`.
- `ops.fund-setup.index.tsx` → `redirect` to `/ops/funds`; `ops.funds.$fundId.tsx` → redirect to `/ops/fund/$fundId`, keeping the old board available as a tab if it's still referenced.
- `src/lib/ops-capabilities.ts` and `src/components/ops-sidebar.tsx`: drop the duplicate "Fund Setup", "All funds" and "Investor work by fund" entries.
- `src/components/fund-workspace.tsx`: Demo switch in the staff-only section (mode harmonious only).
- Record a rule in `src/lib/AGENTS.md`: one Operations Funds list; `is_demo` is display-only.
