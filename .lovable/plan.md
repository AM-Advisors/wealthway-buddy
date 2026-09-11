# Refine the sidebar and the dashboards

The menu has grown to around forty links, all open at once, with some names repeated in
two places. The home page stacks one long card per role. This plan tightens both so people
land on what needs them today and can find any screen in two clicks.

## What is there now

- Menu groups: Overview, Your application (6), Onboarding steps, Fund management (11),
  Operations (6), Administration (18). Every group is expanded permanently.
- "My clients" appears in both Operations and Administration. "Wires and distributions" and
  "Wire instructions" appear in both Fund management and Administration.
- Only the sign-off item shows a count. Nothing else tells you where work is waiting.
- Home stacks a full card per role (investor, manager, operations, admin) with stat tiles and
  a row of link buttons. Nothing is ranked by urgency.

## Sidebar changes

1. **Collapsible groups.** Each group can open and close; the group holding the current page
   opens automatically and stays open. Your choice is remembered between visits.
2. **Remove the duplicates.** "My clients" lives once, at the top, above the groups.
   "Wires and distributions" and "Wire instructions" live once, under Administration, and come
   out of Fund management.
3. **Split Administration into three shorter groups** so no group runs past eight items:
   - Clients and money: My clients, Client onboarding, Clients and scope, Pricing and
     agreements, Unpaid invoices, Wires and distributions, Wire instructions.
   - Applications and funds: Applications, New application, Fund setup, Fund pages, Fund access.
   - Records and oversight: Sign-off, Client portal activity, Onboarding funnel, Document
     activity, Activity log, Audit log, Security, Email preview.
4. **Counts on the items that hold work**: Sign-off, Unpaid invoices, Applications and My
   clients get a small number badge when something is waiting, using the figures the pages
   already load. No badge when the count is zero.
5. **Quick find.** A small search box at the top of the menu filters items by name, so any
   screen is reachable by typing a word.
6. **Clearer icons.** Distinct icons for wires, invoices, pricing, clients and records instead
   of reusing the same three, plus a stronger teal marker on the current page.
7. Collapsed (icon-only) mode keeps working, with tooltips and badges still visible.

## Dashboard changes

1. **A "Needs you today" strip at the top of Home**, above the role cards: the few items that
   are overdue, awaiting your signature or awaiting your approval, each linking straight to the
   screen that clears it. Empty state says everything is clear.
2. **Tighter role cards.** Stat tiles become a single compact row; the long button rows shrink
   to the three most-used links per role, with the rest behind "More".
3. **Roles become tabs when someone wears more than one hat**, so an admin who is also an
   investor sees one screen at a time rather than four stacked cards.
4. **Consistent card style across Home, My clients and the client portal**: same heading size,
   same stat tile, same "waiting on" wording, same date and money formatting.
5. **Overdue and running-late items styled the same everywhere** (amber for due soon, red for
   overdue), matching the staff calendar already in use.
6. Client portal Overview keeps its content and gains the same "Needs you" strip, so a client
   sees unsigned documents, unpaid invoices and quotes awaiting signature first.

## Technical notes

- Menu work is confined to `src/components/app-sidebar.tsx` plus a small badge-count server
  function reusing existing queries; group open state persists in local storage.
- Home changes sit in `src/routes/_authenticated/home.tsx` with shared `Stat` and
  `NeedsYou` components extracted to `src/components/dashboard-primitives.tsx`, reused by
  `client-dashboard.tsx` and `staff-desk.tsx`.
- No permission, scope or data changes: every item still renders only for the roles that see it
  today, and out-of-scope wording is untouched.
