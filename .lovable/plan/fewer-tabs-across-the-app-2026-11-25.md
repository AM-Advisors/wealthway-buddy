# Fewer tabs across the app

## What changes for people
- No screen shows more than 4 or 5 tabs. The most-used ones stay visible, and the rest move into one **More ▾** menu next to them.
- Tabs that overlap get merged into one, for example separate "Pending" and "Waiting" lists become one list with a filter.
- On phones and narrow windows the tabs turn into a single dropdown, so nothing gets cut off.
- Every tab keeps its own link, so bookmarks and email links still open the right section.

## Screens, worst first
1. Pricing (17 tabs) → 4 groups: Services, Packages, Rate cards, Approvals
2. Diligence room (15) → 4: Overview, Documents, Questions, Activity
3. Compliance center (12) → 4: To do, Filings, Records, Settings
4. Sales, Accounting, Investor reporting, Foundation (8 each) → 4 or 5 each
5. Documents, Fund admin, Audit, Report cards, Cap table, Company 360 (7 each) → 4 or 5 each
6. Screens with 5 or 6 tabs: only get the More menu and the phone dropdown

I'll show you screenshots of the first three before I do the rest.

## What stays the same
- Who can see or do what. Hidden tabs stay hidden for people without access.
- All data, approvals and history.

## Technical details
- One shared `CondensedTabs` wrapper over the existing Tabs: a `primary` list plus overflow `DropdownMenu`, and a `Select` below `md`.
- Groupings are decided per screen after reading what each tab does. Permission checks stay on the server.
- Only display code changes.
