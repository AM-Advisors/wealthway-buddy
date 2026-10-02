# Connect the Cap Table into Operations

## What exists today
- The cap table editor (src/components/cap-table-editor.tsx) already works per fund: it loads funds, picks one, and edits each investor's shares, committed capital and ownership with live totals and an audit log (src/lib/cap-table.functions.ts: getCapTableEditor, saveCapPosition, getCapTableLog).
- But it only lives on the admin page /admin/cap-table. Operations fund pages (ops.funds.$fundId, ops.fund-setup.$fundId) have no cap table view, and the Operations menu has no Cap Tables entry.

## Changes

### 1. Cap Table tab on Operations fund pages
- Add a "Cap Table" tab to the Operations fund page (ops.funds.$fundId.tsx) that embeds the existing editor pre-locked to that fund (new optional `fundId` prop on CapTableEditor so the fund picker is hidden and the fund is fixed).
- Same tab on the fund setup page (ops.fund-setup.$fundId.tsx) so staff see ownership taking shape during setup.
- Editing stays exactly as today: saveCapPosition with its existing server-side staff authorization and append-only cap_table_changes audit log. No new write paths.

### 2. Cap Tables section in the Operations menu
- Add a "Cap Tables" entry to the Operations menu (src/lib/ops-capabilities.ts) pointing to a new Operations route /ops/cap-tables that renders the same editor with the fund picker (staff see all funds they serve).
- The existing /admin/cap-table page keeps working; both render the same component.

### 3. Automatic availability for every fund
- A fund's cap table is derived from its investors and positions, so there is nothing to "create" — but today staff must hunt for it. After this change every fund, including funds still in setup, automatically shows its Cap Table tab in Operations with no extra step. Verified with a fund that has no investors yet (shows an empty table with totals at zero, not an error).

## Technical details
- New route: src/routes/_authenticated/ops.cap-tables.tsx (head metadata included), reusing CapTableEditor.
- CapTableEditor gains an optional `fundId` prop; when set, the fund picker row is hidden and loadTable is called with that offering_id.
- All reads/writes go through the existing server functions with their current staff authorization (whoIsStaff / atomic permissions) — no authorization changes, no schema changes, no migrations.
- Verify with bunx tsgo --noEmit and a Playwright pass: open an Operations fund page, confirm the Cap Table tab loads and an edit saves; open /ops/cap-tables from the menu.
